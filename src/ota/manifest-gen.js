import fs from 'fs-extra';
import path from 'path';
import plist from 'plist';

class ManifestGenerator {
  /**
   * 生成manifest.plist文件
   * @param {Object} appInfo 应用信息
   * @param {string} ipaUrl IPA文件URL
   * @param {Object} options 选项
   * @returns {Promise<Object>} 生成结果
   */
  async generateManifest(appInfo, ipaUrl, options = {}) {
    const {
      iconUrl = null,
      outputDir = path.join(process.cwd(), 'public', 'manifests'),
      title = null
    } = options;

    console.log(`生成manifest.plist, 应用: ${appInfo.name}, IPA URL: ${ipaUrl}`);

    // 确保输出目录存在
    await fs.ensureDir(outputDir);

    // 应用标题
    const displayTitle = title || appInfo.name;

    // 构建manifest内容
    const manifest = {
      items: [{
        assets: [{
          kind: "software-package",
          url: ipaUrl
        }],
        metadata: {
          "bundle-identifier": appInfo.bundleId,
          "bundle-version": appInfo.version,
          kind: "software",
          title: displayTitle
        }
      }]
    };

    // 添加图标URL
    if (iconUrl) {
      // 添加小图标
      manifest.items[0].assets.push({
        kind: "display-image",
        url: iconUrl
      });

      // 添加大图标
      manifest.items[0].assets.push({
        kind: "full-size-image",
        url: iconUrl
      });
    }

    // 生成manifest文件名（使用bundleId和版本号）
    const manifestFileName = `${appInfo.bundleId.replace(/\./g, '-')}-${appInfo.version}-${Date.now()}.plist`;
    const manifestPath = path.join(outputDir, manifestFileName);

    // 写入manifest文件
    const manifestContent = plist.build(manifest);
    await fs.writeFile(manifestPath, manifestContent);
    console.log(`manifest.plist已生成: ${manifestPath}`);

    // 返回生成结果
    return {
      manifestPath,
      manifestFileName,
      content: manifestContent
    };
  }

  /**
   * 生成OTA安装链接
   * @param {string} manifestUrl manifest.plist的URL
   * @returns {string} OTA安装链接
   */
  generateOtaLink(manifestUrl) {
    if (!manifestUrl.startsWith('https://')) {
      console.warn('警告: manifest URL不是https协议，iOS设备可能无法安装');
    }

    return `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
  }

  /**
   * 检查manifest URL是否有效
   * @param {string} manifestUrl 
   * @returns {Promise<boolean>}
   */
  async checkManifest(manifestUrl) {
    try {
      const response = await fetch(manifestUrl, {
        method: 'HEAD'
      });
      return response.ok;
    } catch (error) {
      console.error('检查manifest URL失败:', error);
      return false;
    }
  }
}

export default new ManifestGenerator(); 