import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IPATool } from './src/ipa.js';
import { Store } from './src/client.js';
import fetch from 'node-fetch';
import plist from 'plist';

// 设置 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 存储用户账号信息
let userAccounts = {};
try {
  const data = await fs.readFile('accounts.json', 'utf8');
  userAccounts = JSON.parse(data);
} catch (error) {
  console.log('No accounts file found or error reading it. Starting with empty accounts.');
  userAccounts = {};
}

// 保存账号信息到文件
async function saveAccounts() {
  await fs.writeFile('accounts.json', JSON.stringify(userAccounts, null, 2), 'utf8');
}

// API 路由

// 检查账号认证状态
app.post('/api/check-auth', async (req, res) => {
  const { appleId } = req.body;
  
  if (!appleId) {
    return res.status(400).json({ error: '需要提供 Apple ID' });
  }
  
  if (userAccounts[appleId] && userAccounts[appleId].authenticated) {
    return res.json({ authenticated: true, userName: userAccounts[appleId].userName });
  } else {
    return res.json({ authenticated: false });
  }
});

// 第一步登录 - 触发验证码
app.post('/api/auth-step1', async (req, res) => {
  const { appleId, password } = req.body;
  
  if (!appleId || !password) {
    return res.status(400).json({ error: '需要提供 Apple ID 和密码' });
  }
  
  try {
    const result = await Store.authenticate(appleId, password);
    
    // 存储账号信息
    if (!userAccounts[appleId]) {
      userAccounts[appleId] = { password, attempts: 0 };
    }
    
    if (result._state === 'success') {
      // 登录成功，不需要验证码
      userAccounts[appleId].authenticated = true;
      userAccounts[appleId].userName = `${result.accountInfo.address.firstName} ${result.accountInfo.address.lastName}`;
      await saveAccounts();
      
      return res.json({ 
        success: true, 
        needsVerification: false,
        userName: userAccounts[appleId].userName
      });
    } else {
      // 需要验证码，保存状态
      userAccounts[appleId].authenticated = false;
      userAccounts[appleId].attempts++;
      await saveAccounts();
      
      return res.json({ 
        success: true, 
        needsVerification: true,
        message: result.customerMessage
      });
    }
  } catch (error) {
    console.error('认证错误:', error);
    return res.status(500).json({ error: '认证过程中出错', details: error.message });
  }
});

// 第二步登录 - 使用验证码完成登录
app.post('/api/auth-step2', async (req, res) => {
  const { appleId, verificationCode } = req.body;
  
  if (!appleId || !verificationCode) {
    return res.status(400).json({ error: '需要提供 Apple ID 和验证码' });
  }
  
  if (!userAccounts[appleId]) {
    return res.status(400).json({ error: '请先完成第一步验证' });
  }
  
  try {
    const result = await Store.authenticate(appleId, userAccounts[appleId].password, verificationCode);
    
    if (result._state === 'success') {
      userAccounts[appleId].authenticated = true;
      userAccounts[appleId].userName = `${result.accountInfo.address.firstName} ${result.accountInfo.address.lastName}`;
      await saveAccounts();
      
      return res.json({ 
        success: true,
        userName: userAccounts[appleId].userName
      });
    } else {
      return res.status(400).json({ 
        error: '验证码验证失败', 
        details: result.customerMessage
      });
    }
  } catch (error) {
    console.error('验证码认证错误:', error);
    return res.status(500).json({ error: '验证码认证过程中出错', details: error.message });
  }
});

// 获取用户账号列表
app.get('/api/accounts', (req, res) => {
  const accounts = Object.keys(userAccounts).map(id => ({
    appleId: id,
    authenticated: userAccounts[id].authenticated,
    userName: userAccounts[id].userName || null
  }));
  
  res.json({ accounts });
});

// 删除账号
app.delete('/api/accounts/:appleId', async (req, res) => {
  const { appleId } = req.params;
  
  if (userAccounts[appleId]) {
    delete userAccounts[appleId];
    await saveAccounts();
    return res.json({ success: true });
  } else {
    return res.status(404).json({ error: '账号不存在' });
  }
});

// 查询应用版本信息
app.post('/api/query-versions', async (req, res) => {
  const { appleId, appId } = req.body;
  
  if (!appleId || !appId) {
    return res.status(400).json({ error: '需要提供 Apple ID 和应用 ID' });
  }
  
  if (!userAccounts[appleId] || !userAccounts[appleId].authenticated) {
    return res.status(401).json({ error: '账号未认证，请先登录' });
  }
  
  try {
    // 使用Store客户端获取应用信息
    const result = await Store.authenticate(appleId, userAccounts[appleId].password);
    
    if (result._state !== 'success') {
      return res.status(401).json({ error: '账号认证失败，请重新登录', details: result.customerMessage });
    }
    
    // 尝试查询应用最新版本信息
    const app = await Store.download(appId, '', result);
    
    if (app._state !== 'success') {
      return res.status(404).json({ error: '无法获取应用信息', details: app.customerMessage });
    }
    
    // 如果能成功获取应用信息，尝试通过iTunes API查询历史版本
    try {
      // 尝试通过iTunes API查询历史版本
      let iTunesData = null;
      try {
        console.log(`尝试从iTunes API查询应用信息: https://itunes.apple.com/lookup?id=${appId}&country=cn`);
        const iTunesResponse = await fetch(`https://itunes.apple.com/lookup?id=${appId}&country=cn`);
        if (iTunesResponse.ok) {
          iTunesData = await iTunesResponse.json();
          console.log(`iTunes API响应成功，结果数量: ${iTunesData.resultCount || 0}`);
        } else {
          console.log(`iTunes API响应失败: ${iTunesResponse.status} ${iTunesResponse.statusText}`);
        }
      } catch (iTunesError) {
        console.log(`iTunes API查询失败: ${iTunesError.message}`);
      }
      
      // 从新的_extractedInfo字段获取更详细的信息
      const extractedInfo = app._extractedInfo || {};
      const songMetadata = app.songList && app.songList.length > 0 ? app.songList[0].metadata : {};
      
      // 基本版本信息
      const currentVersionInfo = {
        version: extractedInfo.version || songMetadata.bundleShortVersionString,
        versionId: extractedInfo.versionId || songMetadata.externalVersionId,
        size: extractedInfo.downloadBytes || songMetadata.downloadBytes,
        isLatest: true
      };
      
      console.log('当前版本信息:', JSON.stringify(currentVersionInfo, null, 2));
      
      // 历史版本列表
      let historyVersions = [];
      
      // 方法1: 尝试使用_extractedInfo中的versionIdList
      if (extractedInfo.versionIdList && Array.isArray(extractedInfo.versionIdList) && extractedInfo.versionIdList.length > 0) {
        console.log(`从_extractedInfo中找到${extractedInfo.versionIdList.length}个版本ID`);
        
        // 构建历史版本信息数组，暂时只有ID，后续可能需要查询详情
        historyVersions = extractedInfo.versionIdList.map((versionId, index) => {
          // 如果是当前版本，跳过
          if (versionId === currentVersionInfo.versionId) {
            return null;
          }
          
          return {
            versionId: versionId,
            // 临时版本号，可能需要后续查询获取真实版本号
            version: `版本 ${extractedInfo.versionIdList.length - index}`,  // 假设是按照从旧到新排序的
            size: 0,  // 暂时未知
            isHistorical: true
          };
        }).filter(item => item !== null);  // 移除null项
        
        console.log(`过滤后得到 ${historyVersions.length} 个历史版本`);
      } else {
        console.log('未找到versionIdList信息，尝试使用其他方法获取历史版本');
      }
      
      // 方法2: 尝试从iTunes API获取更多信息
      try {
        // 尝试通过结果中的一些信息来构建请求
        const historyUrl = `https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/purchaseHistory?purchaseType=App&guid=${Store.guid}`;
        
        const historyResponse = await fetch(historyUrl, {
          method: 'GET',
          headers: {
            'X-Dsid': result.dsPersonId,
            'iCloud-DSID': result.dsPersonId,
            'User-Agent': 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8'
          }
        });
        
        console.log('历史购买响应状态:', historyResponse.status);
        
        // 尝试解析响应
        let historyData;
        try {
          const responseText = await historyResponse.text();
          console.log('历史购买响应文本的前200个字符:', responseText.substring(0, 200) + '...');
          
          try {
            // 尝试解析为JSON
            historyData = JSON.parse(responseText);
          } catch (jsonError) {
            // 尝试解析为plist
            historyData = plist.parse(responseText);
          }
          
          console.log('历史购买数据:', JSON.stringify(historyData).substring(0, 200) + '...');
        } catch (parseError) {
          console.log('解析历史购买响应失败:', parseError.message);
        }
        
        // 注意: 需要根据实际返回的数据结构来处理
        if (historyData && historyData.items) {
          // 过滤出当前应用的历史版本
          historyVersions = historyData.items
            .filter(item => item.adamId === appId || item.adamId === Number(appId))
            .map(item => ({
              version: item.version,
              versionId: item.externalVersionId,
              purchaseDate: item.purchaseDate,
              size: item.downloadBytes || 0,
              // 其他可能的信息
            }));
          
          console.log(`从历史购买中找到 ${historyVersions.length} 个版本`);
        } else if (historyData) {
          // 尝试从其他可能的结构中查找
          console.log('尝试从不同结构中查找历史版本...');
          
          // 递归查找包含版本信息的数组
          const findVersionArrays = (obj) => {
            if (!obj || typeof obj !== 'object') return [];
            
            const results = [];
            
            Object.keys(obj).forEach(key => {
              if (Array.isArray(obj[key]) && obj[key].length > 0) {
                const firstItem = obj[key][0];
                if (firstItem && typeof firstItem === 'object') {
                  // 检查是否包含版本相关字段
                  if (firstItem.version || firstItem.versionId || firstItem.externalVersionId) {
                    results.push({key, array: obj[key]});
                  }
                }
              } else if (typeof obj[key] === 'object') {
                results.push(...findVersionArrays(obj[key]));
              }
            });
            
            return results;
          };
          
          const possibleArrays = findVersionArrays(historyData);
          console.log(`找到 ${possibleArrays.length} 个可能包含版本信息的数组`);
          
          // 处理找到的数组
          possibleArrays.forEach(({key, array}) => {
            console.log(`处理可能的版本数组: ${key}, 包含 ${array.length} 个项目`);
            
            const versions = array
              .filter(item => {
                // 筛选与当前应用相关的项目
                if (!item) return false;
                if (item.adamId === appId || item.adamId === Number(appId)) return true;
                if (item.appId === appId || item.appId === Number(appId)) return true;
                // 如果没有应用ID，但有版本号，也考虑
                return item.version && (item.versionId || item.externalVersionId);
              })
              .map(item => ({
                version: item.version || item.bundleShortVersionString || '未知',
                versionId: item.versionId || item.externalVersionId || '未知',
                purchaseDate: item.purchaseDate || item.releaseDate || null,
                size: item.downloadBytes || item.size || 0
              }));
            
            historyVersions = [...historyVersions, ...versions];
          });
        }
      } catch (historyError) {
        console.log('获取历史版本列表失败:', historyError.message);
        // 继续执行，不中断，至少返回当前版本信息
      }
      
      // 方法3: 尝试使用Store.download的额外参数来获取版本信息
      // 这是一个尝试性的实现，使用不同的appVerId参数进行多次查询
      try {
        // 这个方法会尝试查询过去几个版本，看是否能获取不同的版本
        console.log('尝试查询不同版本号...');
        
        // 假设版本ID是数字，尝试减少几个数字查询旧版本
        // 注意：这个方法可能不准确，仅用于测试目的
        if (currentVersionInfo.versionId && !isNaN(currentVersionInfo.versionId)) {
          const currentId = Number(currentVersionInfo.versionId);
          
          // 尝试查询几个可能的旧版本
          const possibleOldVersionIds = [
            currentId - 1,  // 上一个版本
            currentId - 5,  // 再早一些的版本
            currentId - 10, // 更早的版本
          ];
          
          for (const oldVersionId of possibleOldVersionIds) {
            if (oldVersionId <= 0) continue;
            
            console.log(`尝试查询可能的旧版本ID: ${oldVersionId}`);
            try {
              const oldApp = await Store.download(appId, String(oldVersionId), result);
              
              if (oldApp._state === 'success' && oldApp.songList && oldApp.songList.length > 0) {
                const oldExtractedInfo = oldApp._extractedInfo || {};
                const oldSongMetadata = oldApp.songList[0].metadata;
                
                const oldVersionInfo = {
                  version: oldExtractedInfo.version || oldSongMetadata.bundleShortVersionString,
                  versionId: oldExtractedInfo.versionId || oldSongMetadata.externalVersionId || String(oldVersionId),
                  size: oldExtractedInfo.downloadBytes || oldSongMetadata.downloadBytes || 0
                };
                
                // 确保这是不同的版本
                if (oldVersionInfo.versionId !== currentVersionInfo.versionId) {
                  console.log(`找到旧版本: ${oldVersionInfo.version} (ID: ${oldVersionInfo.versionId})`);
                  historyVersions.push(oldVersionInfo);
                }
              }
            } catch (oldVersionError) {
              console.log(`查询旧版本ID ${oldVersionId} 失败:`, oldVersionError.message);
            }
          }
        }
      } catch (versionQueryError) {
        console.log('尝试查询旧版本失败:', versionQueryError.message);
      }
      
      // 方法4: 尝试使用应用特定的元数据查找更多版本信息
      try {
        console.log('尝试从应用元数据中提取版本信息...');
        
        // 检查是否有版本历史相关的字段
        if (extractedInfo.allMetadata) {
          const metadata = extractedInfo.allMetadata;
          
          // 查找可能包含版本信息的字段
          Object.keys(metadata).forEach(key => {
            if (
              key.toLowerCase().includes('version') && 
              key !== 'bundleShortVersionString' && 
              key !== 'externalVersionId' &&
              metadata[key]
            ) {
              console.log(`找到可能的版本信息字段: ${key} = ${metadata[key]}`);
              
              // 尝试提取版本号和ID
              if (typeof metadata[key] === 'string' && metadata[key].includes('.')) {
                // 看起来像版本号
                const possibleVersion = {
                  version: metadata[key],
                  versionId: `extracted_${key}_${metadata[key]}`.replace(/\s+/g, '_'),
                  source: key
                };
                
                // 仅添加看起来有效的版本
                if (possibleVersion.version.match(/^\d+(\.\d+)*$/)) {
                  console.log(`提取到可能的版本: ${possibleVersion.version}`);
                  historyVersions.push(possibleVersion);
                }
              }
            }
          });
        }
      } catch (metadataError) {
        console.log('从元数据提取版本信息失败:', metadataError.message);
      }
      
      // 整合所有信息，构建响应
      // 去除重复版本
      const uniqueVersions = [
        currentVersionInfo,
        ...historyVersions
      ].filter((v, i, a) => 
        a.findIndex(item => 
          item.versionId === v.versionId || 
          (item.version === v.version && item.version !== '未知')
        ) === i
      );
      
      console.log(`总共找到 ${uniqueVersions.length} 个唯一版本`);
      
      const versionInfo = {
        appName: extractedInfo.appName || songMetadata.bundleDisplayName,
        currentVersion: currentVersionInfo,
        releaseNotes: iTunesData && iTunesData.results && iTunesData.results[0] ? iTunesData.results[0].releaseNotes : null,
        availableVersions: uniqueVersions
      };
      
      // 如果没有获取到历史版本，添加一个说明
      if (historyVersions.length === 0) {
        console.log('未能获取历史版本列表，仅返回当前版本');
      }
      
      // 返回所有获取到的信息
      return res.json({
        success: true,
        versionInfo,
        message: historyVersions.length === 0 ? 
          "未能获取历史版本列表，仅返回当前版本。Apple未提供直接获取历史版本的API" : 
          `成功获取 ${historyVersions.length} 个历史版本，共 ${uniqueVersions.length} 个唯一版本`
      });
      
    } catch (error) {
      console.error('查询版本列表错误:', error);
      return res.status(500).json({ 
        error: '查询版本列表过程中出错', 
        details: error.message,
        note: "Apple可能未提供直接获取历史版本列表的API"
      });
    }
  } catch (error) {
    console.error('查询版本错误:', error);
    return res.status(500).json({ error: '查询版本信息过程中出错', details: error.message });
  }
});

// 查询应用版本信息 (兼容旧接口名称)
app.post('/api/app-versions', async (req, res) => {
  const { appleId, appId } = req.body;
  
  console.log('收到版本查询请求:', { appleId, appId });
  
  if (!appleId || !appId) {
    console.log('请求缺少参数:', { appleId, appId });
    return res.status(400).json({ error: '需要提供 Apple ID 和应用 ID' });
  }
  
  if (!userAccounts[appleId] || !userAccounts[appleId].authenticated) {
    console.log('账号未认证:', appleId);
    return res.status(401).json({ error: '账号未认证，请先登录' });
  }
  
  try {
    console.log('尝试验证账号...');
    // 使用Store客户端获取应用信息
    const result = await Store.authenticate(appleId, userAccounts[appleId].password);
    
    if (result._state !== 'success') {
      console.log('账号认证失败:', result.customerMessage);
      return res.status(401).json({ error: '账号认证失败，请重新登录', details: result.customerMessage });
    }
    
    console.log('账号认证成功，开始查询应用信息...');
    // 尝试查询应用最新版本信息
    const app = await Store.download(appId, '', result);
    
    if (app._state !== 'success') {
      console.log('应用信息查询失败:', app.customerMessage);
      return res.status(404).json({ error: '无法获取应用信息', details: app.customerMessage });
    }
    
    console.log('应用信息查询成功!');
    
    // 从_extractedInfo获取详细信息
    const extractedInfo = app._extractedInfo || {};
    const songMetadata = app.songList && app.songList.length > 0 ? app.songList[0].metadata : {};
    
    // 尝试通过iTunes API获取更多信息
    let iTunesData = null;
    try {
      console.log(`尝试从iTunes API查询应用信息: https://itunes.apple.com/lookup?id=${appId}&country=cn`);
      const iTunesResponse = await fetch(`https://itunes.apple.com/lookup?id=${appId}&country=cn`);
      if (iTunesResponse.ok) {
        iTunesData = await iTunesResponse.json();
        console.log(`iTunes API响应成功，结果数量: ${iTunesData.resultCount || 0}`);
      } else {
        console.log(`iTunes API响应失败: ${iTunesResponse.status} ${iTunesResponse.statusText}`);
      }
    } catch (iTunesError) {
      console.log(`iTunes API查询失败: ${iTunesError.message}`);
    }
    
    // 获取当前版本信息
    const currentVersionInfo = {
      version: extractedInfo.version || songMetadata.bundleShortVersionString,
      versionId: extractedInfo.versionId || songMetadata.softwareVersionExternalIdentifier,
      size: extractedInfo.downloadBytes || songMetadata.downloadBytes,
      isLatest: true
    };
    
    console.log('当前版本信息:', currentVersionInfo);
    
    // 尝试获取历史版本列表
    // 方法1: 使用versionIdList直接获取历史版本ID列表
    let historyVersions = [];
    
    if (extractedInfo.versionIdList && extractedInfo.versionIdList.length > 0) {
      console.log(`从versionIdList中获取到 ${extractedInfo.versionIdList.length} 个历史版本ID`);
      
      // 构建历史版本信息数组，暂时只有ID，后续可能需要查询详情
      historyVersions = extractedInfo.versionIdList.map((versionId, index) => {
        // 如果是当前版本，跳过
        if (versionId === currentVersionInfo.versionId) {
          return null;
        }
        
        return {
          versionId: versionId,
          // 临时版本号，可能需要后续查询获取真实版本号
          version: `版本 ${extractedInfo.versionIdList.length - index}`,  // 假设是按照从旧到新排序的
          size: 0,  // 暂时未知
          isHistorical: true
        };
      }).filter(item => item !== null);  // 移除null项
      
      console.log(`过滤后得到 ${historyVersions.length} 个历史版本`);
    } else {
      console.log('未找到versionIdList信息，尝试使用其他方法获取历史版本');
    }
    
    // 方法2: 尝试从iTunes API获取更多信息
    try {
      // 尝试通过结果中的一些信息来构建请求
      const historyUrl = `https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/purchaseHistory?purchaseType=App&guid=${Store.guid}`;
      
      const historyResponse = await fetch(historyUrl, {
        method: 'GET',
        headers: {
          'X-Dsid': result.dsPersonId,
          'iCloud-DSID': result.dsPersonId,
          'User-Agent': 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8'
        }
      });
      
      console.log('历史购买响应状态:', historyResponse.status);
      
      // 尝试解析响应
      let historyData;
      try {
        const responseText = await historyResponse.text();
        console.log('历史购买响应文本的前200个字符:', responseText.substring(0, 200) + '...');
        
        try {
          // 尝试解析为JSON
          historyData = JSON.parse(responseText);
        } catch (jsonError) {
          // 尝试解析为plist
          historyData = plist.parse(responseText);
        }
        
        console.log('历史购买数据:', JSON.stringify(historyData).substring(0, 200) + '...');
      } catch (parseError) {
        console.log('解析历史购买响应失败:', parseError.message);
      }
      
      // 注意: 需要根据实际返回的数据结构来处理
      if (historyData && historyData.items) {
        // 过滤出当前应用的历史版本
        historyVersions = historyData.items
          .filter(item => item.adamId === appId || item.adamId === Number(appId))
          .map(item => ({
            version: item.version,
            versionId: item.externalVersionId,
            purchaseDate: item.purchaseDate,
            size: item.downloadBytes || 0,
            // 其他可能的信息
          }));
        
        console.log(`从历史购买中找到 ${historyVersions.length} 个版本`);
      } else if (historyData) {
        // 尝试从其他可能的结构中查找
        console.log('尝试从不同结构中查找历史版本...');
        
        // 递归查找包含版本信息的数组
        const findVersionArrays = (obj) => {
          if (!obj || typeof obj !== 'object') return [];
          
          const results = [];
          
          Object.keys(obj).forEach(key => {
            if (Array.isArray(obj[key]) && obj[key].length > 0) {
              const firstItem = obj[key][0];
              if (firstItem && typeof firstItem === 'object') {
                // 检查是否包含版本相关字段
                if (firstItem.version || firstItem.versionId || firstItem.externalVersionId) {
                  results.push({key, array: obj[key]});
                }
              }
            } else if (typeof obj[key] === 'object') {
              results.push(...findVersionArrays(obj[key]));
            }
          });
          
          return results;
        };
        
        const possibleArrays = findVersionArrays(historyData);
        console.log(`找到 ${possibleArrays.length} 个可能包含版本信息的数组`);
        
        // 处理找到的数组
        possibleArrays.forEach(({key, array}) => {
          console.log(`处理可能的版本数组: ${key}, 包含 ${array.length} 个项目`);
          
          const versions = array
            .filter(item => {
              // 筛选与当前应用相关的项目
              if (!item) return false;
              if (item.adamId === appId || item.adamId === Number(appId)) return true;
              if (item.appId === appId || item.appId === Number(appId)) return true;
              // 如果没有应用ID，但有版本号，也考虑
              return item.version && (item.versionId || item.externalVersionId);
            })
            .map(item => ({
              version: item.version || item.bundleShortVersionString || '未知',
              versionId: item.versionId || item.externalVersionId || '未知',
              purchaseDate: item.purchaseDate || item.releaseDate || null,
              size: item.downloadBytes || item.size || 0
            }));
          
          historyVersions = [...historyVersions, ...versions];
        });
      }
    } catch (historyError) {
      console.log('获取历史版本列表失败:', historyError.message);
      // 继续执行，不中断，至少返回当前版本信息
    }
    
    // 方法3: 尝试使用Store.download的额外参数来获取版本信息
    // 这是一个尝试性的实现，使用不同的appVerId参数进行多次查询
    try {
      // 这个方法会尝试查询过去几个版本，看是否能获取不同的版本
      console.log('尝试查询不同版本号...');
      
      // 假设版本ID是数字，尝试减少几个数字查询旧版本
      // 注意：这个方法可能不准确，仅用于测试目的
      if (currentVersionInfo.versionId && !isNaN(currentVersionInfo.versionId)) {
        const currentId = Number(currentVersionInfo.versionId);
        
        // 尝试查询几个可能的旧版本
        const possibleOldVersionIds = [
          currentId - 1,  // 上一个版本
          currentId - 5,  // 再早一些的版本
          currentId - 10, // 更早的版本
        ];
        
        for (const oldVersionId of possibleOldVersionIds) {
          if (oldVersionId <= 0) continue;
          
          console.log(`尝试查询可能的旧版本ID: ${oldVersionId}`);
          try {
            const oldApp = await Store.download(appId, String(oldVersionId), result);
            
            if (oldApp._state === 'success' && oldApp.songList && oldApp.songList.length > 0) {
              const oldExtractedInfo = oldApp._extractedInfo || {};
              const oldSongMetadata = oldApp.songList[0].metadata;
              
              const oldVersionInfo = {
                version: oldExtractedInfo.version || oldSongMetadata.bundleShortVersionString,
                versionId: oldExtractedInfo.versionId || oldSongMetadata.externalVersionId || String(oldVersionId),
                size: oldExtractedInfo.downloadBytes || oldSongMetadata.downloadBytes || 0
              };
              
              // 确保这是不同的版本
              if (oldVersionInfo.versionId !== currentVersionInfo.versionId) {
                console.log(`找到旧版本: ${oldVersionInfo.version} (ID: ${oldVersionInfo.versionId})`);
                historyVersions.push(oldVersionInfo);
              }
            }
          } catch (oldVersionError) {
            console.log(`查询旧版本ID ${oldVersionId} 失败:`, oldVersionError.message);
          }
        }
      }
    } catch (versionQueryError) {
      console.log('尝试查询旧版本失败:', versionQueryError.message);
    }
    
    // 方法4: 尝试使用应用特定的元数据查找更多版本信息
    try {
      console.log('尝试从应用元数据中提取版本信息...');
      
      // 检查是否有版本历史相关的字段
      if (extractedInfo.allMetadata) {
        const metadata = extractedInfo.allMetadata;
        
        // 查找可能包含版本信息的字段
        Object.keys(metadata).forEach(key => {
          if (
            key.toLowerCase().includes('version') && 
            key !== 'bundleShortVersionString' && 
            key !== 'externalVersionId' &&
            metadata[key]
          ) {
            console.log(`找到可能的版本信息字段: ${key} = ${metadata[key]}`);
            
            // 尝试提取版本号和ID
            if (typeof metadata[key] === 'string' && metadata[key].includes('.')) {
              // 看起来像版本号
              const possibleVersion = {
                version: metadata[key],
                versionId: `extracted_${key}_${metadata[key]}`.replace(/\s+/g, '_'),
                source: key
              };
              
              // 仅添加看起来有效的版本
              if (possibleVersion.version.match(/^\d+(\.\d+)*$/)) {
                console.log(`提取到可能的版本: ${possibleVersion.version}`);
                historyVersions.push(possibleVersion);
              }
            }
          }
        });
      }
    } catch (metadataError) {
      console.log('从元数据提取版本信息失败:', metadataError.message);
    }
    
    // 整合所有信息，构建响应
    // 去除重复版本
    const uniqueVersions = [
      currentVersionInfo,
      ...historyVersions
    ].filter((v, i, a) => 
      a.findIndex(item => 
        item.versionId === v.versionId || 
        (item.version === v.version && item.version !== '未知')
      ) === i
    );
    
    console.log(`总共找到 ${uniqueVersions.length} 个唯一版本`);
    
    const versionInfo = {
      appName: extractedInfo.appName || songMetadata.bundleDisplayName,
      currentVersion: currentVersionInfo,
      releaseNotes: iTunesData && iTunesData.results && iTunesData.results[0] ? iTunesData.results[0].releaseNotes : null,
      availableVersions: uniqueVersions
    };
    
    // 如果没有获取到历史版本，添加一个说明
    if (historyVersions.length === 0) {
      console.log('未能获取历史版本列表，仅返回当前版本');
    }
    
    // 返回所有获取到的信息
    return res.json({
      success: true,
      versionInfo,
      message: historyVersions.length === 0 ? 
        "未能获取历史版本列表，仅返回当前版本。Apple未提供直接获取历史版本的API" : 
        `成功获取 ${historyVersions.length} 个历史版本，共 ${uniqueVersions.length} 个唯一版本`
    });
    
  } catch (error) {
    console.error('查询版本列表错误:', error);
    return res.status(500).json({ 
      error: '查询版本列表过程中出错', 
      details: error.message,
      note: "Apple可能未提供直接获取历史版本列表的API"
    });
  }
});

// 下载应用
app.post('/api/download', async (req, res) => {
  const { appleId, appId, appVerId } = req.body;
  
  if (!appleId || !appId) {
    return res.status(400).json({ error: '需要提供 Apple ID 和应用 ID' });
  }
  
  if (!userAccounts[appleId] || !userAccounts[appleId].authenticated) {
    return res.status(401).json({ error: '账号未认证，请先登录' });
  }
  
  const ipaTool = new IPATool();
  
  try {
    const result = await ipaTool.downipa({
      path: './downloads',
      APPLE_ID: appleId,
      PASSWORD: userAccounts[appleId].password,
      CODE: '',
      APPID: appId,
      appVerId: appVerId || '',
      onError: (type, message) => {
        if (type === 'VERSION_NOT_AVAILABLE') {
          // 特殊处理版本不可用的情况
          return false; // 中止执行
        }
        return false; // 其他错误也中止
      }
    });
    
    if (!result || !result.success) {
      return res.status(500).json({ 
        error: result?.error || '下载失败', 
        errorType: result?.errorType || 'UNKNOWN_ERROR',
        details: result?.details || '未知错误'
      });
    }
    
    // 构建下载链接和文件信息
    const downloadLink = `/downloads/${path.basename(result.filePath)}`;
    const stats = await fs.stat(result.filePath);
    
    return res.json({
      success: true,
      appName: result.appName,
      version: result.version,
      versionId: result.versionId,
      realVersion: result.version,
      fileSize: stats.size,
      isRequestedVersion: result.isRequestedVersion,
      downloadLink: downloadLink
    });
  } catch (error) {
    console.error('下载错误:', error);
    return res.status(500).json({ error: '下载过程中出错', details: error.message });
  }
});

// 下载文件路由
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// 提供前端页面
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 创建必要的目录
async function createDirs() {
  const dirs = ['public', 'downloads'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`创建目录 ${dir} 失败:`, error);
    }
  }
}

// 启动服务器
async function start() {
  await createDirs();
  
  app.listen(PORT, () => {
    console.log(`服务器已启动: http://localhost:${PORT}`);
  });
}

start().catch(console.error);