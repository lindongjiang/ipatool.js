import path from 'path';
import fs from 'fs-extra';
import ipaParser from './ipa-parser.js';
import manifestGen from './manifest-gen.js';

class OtaService {
  /**
   * 处理IPA文件并生成OTA安装链接
   * @param {string} ipaPath IPA文件路径
   * @param {string} baseUrl 服务器基础URL
   * @param {Object} options 选项
   * @returns {Promise<Object>} 处理结果
   */
  async processIPA(ipaPath, baseUrl, options = {}) {
    console.log(`开始处理IPA文件: ${ipaPath}`);
    console.log(`服务器基础URL: ${baseUrl}`);

    try {
      // 确保基础URL不以斜杠结尾
      const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

      // 解析IPA文件
      console.log('正在解析IPA文件...');
      const appInfo = await ipaParser.parseIPA(ipaPath, {
        outputDir: path.join(process.cwd(), 'public'),
        tempDir: path.join(process.cwd(), 'temp')
      });

      console.log(`解析IPA完成，应用信息: ${JSON.stringify(appInfo, null, 2)}`);

      // 确保IPA文件可通过URL访问
      const ipaFileName = path.basename(ipaPath);
      const publicIpaPath = `/downloads/${ipaFileName}`;
      const ipaUrl = `${normalizedBaseUrl}${publicIpaPath}`;

      console.log(`IPA URL: ${ipaUrl}`);

      // 构建图标URL
      let iconUrl = null;
      if (appInfo.iconPath) {
        const iconFileName = path.basename(appInfo.iconPath);
        const iconRelativePath = path.relative(path.join(process.cwd(), 'public'), appInfo.iconPath);
        const iconUrl = `${normalizedBaseUrl}/${iconRelativePath}`;
        console.log(`图标URL: ${iconUrl}`);
      }

      // 生成manifest.plist
      console.log('正在生成manifest.plist...');
      const manifestResult = await manifestGen.generateManifest(appInfo, ipaUrl, {
        iconUrl: iconUrl,
        outputDir: path.join(process.cwd(), 'public', 'manifests')
      });

      // 构建manifest URL
      const manifestRelativePath = `manifests/${manifestResult.manifestFileName}`;
      const manifestUrl = `${normalizedBaseUrl}/${manifestRelativePath}`;
      console.log(`Manifest URL: ${manifestUrl}`);

      // 生成OTA链接
      const otaLink = manifestGen.generateOtaLink(manifestUrl);
      console.log(`OTA链接: ${otaLink}`);

      return {
        success: true,
        appInfo: {
          name: appInfo.name,
          bundleId: appInfo.bundleId,
          version: appInfo.version,
          buildVersion: appInfo.buildVersion
        },
        files: {
          ipa: ipaPath,
          manifest: manifestResult.manifestPath,
          icon: appInfo.iconPath
        },
        urls: {
          ipa: ipaUrl,
          manifest: manifestUrl,
          icon: iconUrl
        },
        otaLink
      };
    } catch (error) {
      console.error('处理IPA文件失败:', error);
      throw error;
    }
  }

  /**
   * 根据已下载的IPA文件生成OTA安装链接
   * @param {Object} downloadResult IPA下载结果
   * @param {string} baseUrl 服务器基础URL
   * @returns {Promise<Object>} OTA安装信息
   */
  async generateOtaForDownload(downloadResult, baseUrl) {
    if (!downloadResult || !downloadResult.success || !downloadResult.filePath) {
      throw new Error('无效的下载结果');
    }

    // 处理IPA文件
    return await this.processIPA(downloadResult.filePath, baseUrl);
  }
}

export default new OtaService(); 