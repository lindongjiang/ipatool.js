import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import plist from 'plist';
import { exec } from 'child_process';
import { promisify } from 'util';
import sizeOf from 'image-size';

const execAsync = promisify(exec);

class IPAParser {
  /**
   * 解析IPA文件
   * @param {string} ipaPath IPA文件路径
   * @param {Object} options 选项
   * @returns {Promise<Object>} 应用信息
   */
  async parseIPA(ipaPath, options = {}) {
    const { 
      outputDir = path.join(process.cwd(), 'public'),
      tempDir = path.join(process.cwd(), 'temp')
    } = options;
    
    console.log(`开始解析IPA文件: ${ipaPath}`);
    
    // 创建临时目录
    const extractDir = path.join(tempDir, `ipa-${Date.now()}`);
    await fs.ensureDir(extractDir);
    
    try {
      // 解压IPA文件
      console.log(`解压IPA到: ${extractDir}`);
      const zip = new AdmZip(ipaPath);
      zip.extractAllTo(extractDir, true);
      
      // 找到app目录
      const payloadDir = path.join(extractDir, 'Payload');
      if (!await fs.pathExists(payloadDir)) {
        throw new Error('无效的IPA文件: 找不到Payload目录');
      }
      
      const appDirs = await fs.readdir(payloadDir);
      const appDir = appDirs.find(dir => dir.endsWith('.app'));
      if (!appDir) {
        throw new Error('无效的IPA文件: 找不到.app目录');
      }
      
      const appPath = path.join(payloadDir, appDir);
      
      // 读取Info.plist
      console.log(`读取Info.plist: ${appPath}`);
      let infoPlist;
      const infoPlistPath = path.join(appPath, 'Info.plist');
      
      // 有些Info.plist是二进制格式，尝试转换
      if (await this.isBinaryPlist(infoPlistPath)) {
        console.log('检测到二进制plist，尝试转换为XML格式');
        try {
          // 尝试使用plutil（macOS）
          const xmlPlistPath = `${infoPlistPath}.xml`;
          await execAsync(`plutil -convert xml1 -o "${xmlPlistPath}" "${infoPlistPath}"`);
          const xmlPlistData = await fs.readFile(xmlPlistPath, 'utf8');
          infoPlist = plist.parse(xmlPlistData);
          await fs.remove(xmlPlistPath);
        } catch (error) {
          // 如果plutil失败，尝试直接读取
          console.log('plutil转换失败，尝试直接读取:', error.message);
          const plistData = await fs.readFile(infoPlistPath);
          infoPlist = plist.parse(plistData.toString());
        }
      } else {
        const plistData = await fs.readFile(infoPlistPath, 'utf8');
        infoPlist = plist.parse(plistData);
      }
      
      // 提取应用基本信息
      const appInfo = {
        bundleId: infoPlist.CFBundleIdentifier,
        version: infoPlist.CFBundleShortVersionString,
        buildVersion: infoPlist.CFBundleVersion,
        name: infoPlist.CFBundleDisplayName || infoPlist.CFBundleName,
        minimumOSVersion: infoPlist.MinimumOSVersion
      };
      
      console.log(`应用信息: ${JSON.stringify(appInfo, null, 2)}`);
      
      // 提取图标
      const iconResult = await this.extractIcons(appPath, infoPlist, appInfo.bundleId, outputDir);
      appInfo.iconPath = iconResult.iconPath;
      appInfo.iconInfo = iconResult.iconInfo;
      
      return {
        ...appInfo,
        originalPath: ipaPath,
        extractPath: appPath
      };
    } catch (error) {
      console.error('解析IPA文件失败:', error);
      throw error;
    } finally {
      // 清理临时目录
      try {
        await fs.remove(extractDir);
      } catch (err) {
        console.error('清理临时目录失败:', err);
      }
    }
  }
  
  /**
   * 判断plist是否是二进制格式
   * @param {string} plistPath 
   * @returns {Promise<boolean>}
   */
  async isBinaryPlist(plistPath) {
    try {
      const buffer = await fs.readFile(plistPath);
      // 检查文件头是否为二进制plist标记 'bplist'
      return buffer.slice(0, 6).toString() === 'bplist';
    } catch (error) {
      console.error('检查plist格式失败:', error);
      return false;
    }
  }
  
  /**
   * 提取应用图标
   * @param {string} appPath 应用目录路径
   * @param {Object} infoPlist Info.plist内容
   * @param {string} bundleId 应用的Bundle ID
   * @param {string} outputDir 输出目录
   * @returns {Promise<Object>} 图标信息
   */
  async extractIcons(appPath, infoPlist, bundleId, outputDir) {
    const iconFiles = [];
    let iconPath = null;
    let iconInfo = null;
    
    try {
      // 检查不同的图标键
      let iconFilenames = [];
      
      // 常见的图标位置
      if (infoPlist.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconFiles) {
        iconFilenames = infoPlist.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles;
      } else if (infoPlist.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName) {
        iconFilenames = [infoPlist.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName];
      } else if (infoPlist.CFBundleIconFiles) {
        iconFilenames = infoPlist.CFBundleIconFiles;
      }
      
      // 如果仍没找到图标，尝试使用CFBundleIconFile
      if (iconFilenames.length === 0 && infoPlist.CFBundleIconFile) {
        iconFilenames = [infoPlist.CFBundleIconFile];
      }
      
      console.log(`找到的图标文件名: ${iconFilenames.join(', ')}`);
      
      // 查找图标文件
      const possibleExtensions = ['', '.png', '@2x.png', '@3x.png'];
      
      for (const filename of iconFilenames) {
        for (const ext of possibleExtensions) {
          const iconFilename = `${filename}${ext}`;
          const iconFilePath = path.join(appPath, iconFilename);
          
          if (await fs.pathExists(iconFilePath)) {
            try {
              const stats = await fs.stat(iconFilePath);
              const dimensions = await sizeOf(iconFilePath);
              
              iconFiles.push({
                path: iconFilePath,
                size: stats.size,
                width: dimensions.width,
                height: dimensions.height,
                filename: iconFilename
              });
            } catch (err) {
              console.log(`读取图标 ${iconFilename} 信息失败:`, err.message);
            }
          }
        }
      }
      
      // 如果没找到图标，尝试常见的图标名称
      if (iconFiles.length === 0) {
        const commonIconNames = ['Icon.png', 'Icon@2x.png', 'AppIcon60x60@2x.png', 'AppIcon60x60@3x.png'];
        for (const name of commonIconNames) {
          const iconFilePath = path.join(appPath, name);
          if (await fs.pathExists(iconFilePath)) {
            try {
              const stats = await fs.stat(iconFilePath);
              const dimensions = await sizeOf(iconFilePath);
              
              iconFiles.push({
                path: iconFilePath,
                size: stats.size,
                width: dimensions.width,
                height: dimensions.height,
                filename: name
              });
            } catch (err) {
              console.log(`读取图标 ${name} 信息失败:`, err.message);
            }
          }
        }
      }
      
      // 按尺寸排序，选择最大的图标
      iconFiles.sort((a, b) => (b.width * b.height) - (a.width * a.height));
      
      if (iconFiles.length > 0) {
        // 选择最大的图标
        const largestIcon = iconFiles[0];
        console.log(`选择最大的图标: ${largestIcon.filename} (${largestIcon.width}x${largestIcon.height})`);
        
        // 创建输出目录
        const iconsDir = path.join(outputDir, 'icons');
        await fs.ensureDir(iconsDir);
        
        // 生成唯一的图标文件名
        const iconFileName = `${bundleId.replace(/\./g, '-')}-${Date.now()}.png`;
        iconPath = path.join(iconsDir, iconFileName);
        
        // 复制图标
        await fs.copy(largestIcon.path, iconPath);
        console.log(`已复制图标到: ${iconPath}`);
        
        iconInfo = {
          width: largestIcon.width,
          height: largestIcon.height,
          originalName: largestIcon.filename,
          path: iconPath
        };
      } else {
        console.log('未找到有效的图标文件');
      }
    } catch (error) {
      console.error('提取图标失败:', error);
    }
    
    return { iconPath, iconInfo };
  }
}

export default new IPAParser(); 