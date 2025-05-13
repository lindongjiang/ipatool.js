import plist from 'plist';
import getMAC from 'getmac';
import fetchCookie from 'fetch-cookie';
import nodeFetch from 'node-fetch';

class Store {
    static get guid() {
        return getMAC().replace(/:/g, '').toUpperCase();
    }

    static async authenticate(email, password, mfa) {
        const dataJson = {
            appleId: email,
            attempt: mfa ? 2 : 4,
            createSession: 'true',
            guid: this.guid,
            password: `${password}${mfa ?? ''}`,
            rmp: 0,
            why: 'signIn',
        };
        const body = plist.build(dataJson);
        const url = `https://auth.itunes.apple.com/auth/v1/native/fast?guid=${this.guid}`;
        const resp = await this.fetch(url, {method: 'POST', body, headers: this.Headers});
        const parsedResp = plist.parse(await resp.text());
        //console.log(JSON.stringify(parsedResp));
        return {...parsedResp, _state: parsedResp.hasOwnProperty('failureType') ? 'failure' : 'success'};
    }

    static async download(appIdentifier, appVerId, Cookie) {
        console.log('------下载请求参数------');
        console.log(`应用ID (APPID): ${appIdentifier}`);
        console.log(`版本ID (appVerId): ${appVerId ? appVerId : '未指定（将下载最新版本）'}`);
        
        const dataJson = {
            creditDisplay: '',
            guid: this.guid,
            salableAdamId: appIdentifier,
            ...(appVerId && {externalVersionId: appVerId})
        };
        
        console.log('实际请求数据:');
        console.log(JSON.stringify(dataJson, null, 2));
        
        const body = plist.build(dataJson);
        const url = `https://p25-buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct?guid=${this.guid}`;
        
        console.log(`请求URL: ${url}`);
        
        const resp = await this.fetch(url, {
            method: 'POST', body,
            headers: {...this.Headers, 'X-Dsid': Cookie.dsPersonId, 'iCloud-DSID': Cookie.dsPersonId}
            //'X-Token': Cookie.passwordToken
        });
        
        const responseText = await resp.text();
        console.log('------收到响应------');
        console.log(`响应状态: ${resp.status} ${resp.statusText}`);
        
        // 保存原始响应文本，以便调试
        console.log('响应文本的前500个字符:');
        console.log(responseText.substring(0, 500) + '...');
        
        const parsedResp = plist.parse(responseText);
        
        // 输出整个解析后的响应，方便调试
        console.log('解析后的响应结构:');
        console.log(JSON.stringify(parsedResp, null, 2).substring(0, 1000) + '...');
        
        // 检查响应中是否包含版本信息
        if (parsedResp.songList && parsedResp.songList.length > 0) {
            const song = parsedResp.songList[0];
            console.log(`下载的应用: ${song.metadata.bundleDisplayName}`);
            console.log(`版本: ${song.metadata.bundleShortVersionString}`);
            
            // 详细记录元数据信息
            console.log('应用元数据详情:');
            Object.keys(song.metadata).forEach(key => {
                console.log(`${key}: ${song.metadata[key]}`);
            });
            
            // 特别关注版本ID和下载大小
            if (song.metadata.externalVersionId) {
                console.log(`服务器返回的版本ID: ${song.metadata.externalVersionId}`);
                console.log(`是否匹配请求的版本ID: ${appVerId === song.metadata.externalVersionId ? '是' : '否'}`);
            } else {
                console.log('警告: 响应中没有找到externalVersionId');
                // 尝试查找其他可能包含版本ID的字段
                Object.keys(song.metadata).forEach(key => {
                    if (key.toLowerCase().includes('version') || key.toLowerCase().includes('id')) {
                        console.log(`可能的版本ID字段 "${key}": ${song.metadata[key]}`);
                    }
                });
            }
            
            if (song.metadata.downloadBytes) {
                console.log(`文件大小: ${song.metadata.downloadBytes} 字节`);
            } else {
                console.log('警告: 响应中没有找到downloadBytes');
                // 尝试查找其他可能包含大小的字段
                Object.keys(song.metadata).forEach(key => {
                    if (key.toLowerCase().includes('size') || key.toLowerCase().includes('bytes')) {
                        console.log(`可能的大小字段 "${key}": ${song.metadata[key]}`);
                    }
                });
            }
            
            // 处理版本ID列表
            let versionId = song.metadata.externalVersionId;
            let versionIdList = [];
            
            // 如果没有找到externalVersionId，尝试使用softwareVersionExternalIdentifier
            if (!versionId && song.metadata.softwareVersionExternalIdentifier) {
                versionId = song.metadata.softwareVersionExternalIdentifier;
                console.log(`使用softwareVersionExternalIdentifier作为版本ID: ${versionId}`);
            }
            
            // 尝试解析版本ID列表
            if (song.metadata.softwareVersionExternalIdentifiers) {
                try {
                    const idsString = song.metadata.softwareVersionExternalIdentifiers;
                    console.log(`发现版本ID列表: ${idsString} (类型: ${typeof idsString})`);
                    
                    // 检查是否为字符串再尝试分割
                    if (typeof idsString === 'string') {
                        // 尝试不同的分隔符
                        let versionIdArray = [];
                        if (idsString.includes(',')) {
                            versionIdArray = idsString.split(',').map(id => id.trim());
                        } else if (idsString.includes(';')) {
                            versionIdArray = idsString.split(';').map(id => id.trim());
                        } else if (idsString.includes(' ')) {
                            versionIdArray = idsString.split(' ').map(id => id.trim());
                        } else {
                            // 可能是单个ID，或者使用其他分隔符
                            // 尝试使用正则表达式提取数字
                            const matches = idsString.match(/\d+/g);
                            if (matches && matches.length > 0) {
                                versionIdArray = matches;
                                console.log(`使用正则表达式提取的ID: ${matches.join(', ')}`);
                            } else {
                                versionIdArray = [idsString]; // 作为单个ID处理
                            }
                        }
                        
                        // 过滤空字符串和非数字
                        versionIdList = versionIdArray
                            .filter(id => id && !isNaN(id))
                            .map(id => id.trim());
                            
                        console.log(`解析得到 ${versionIdList.length} 个历史版本ID:`);
                        versionIdList.forEach((id, index) => console.log(`  ${index+1}. ${id}`));
                        
                    } else if (Array.isArray(idsString)) {
                        // 如果已经是数组，直接使用
                        versionIdList = idsString
                            .filter(id => id && !isNaN(id))
                            .map(id => String(id).trim());
                        console.log(`直接使用数组，包含 ${versionIdList.length} 个历史版本ID`);
                        versionIdList.forEach((id, index) => console.log(`  ${index+1}. ${id}`));
                    } else {
                        console.log(`警告: softwareVersionExternalIdentifiers 不是字符串或数组，而是 ${typeof idsString}`);
                        // 尝试将对象转换为字符串
                        try {
                            const convertedString = String(idsString);
                            console.log(`尝试将类型 ${typeof idsString} 转换为字符串: ${convertedString}`);
                            
                            // 提取数字
                            const matches = convertedString.match(/\d+/g);
                            if (matches && matches.length > 0) {
                                versionIdList = matches;
                                console.log(`从转换后的字符串提取得到 ${versionIdList.length} 个版本ID`);
                                versionIdList.forEach((id, index) => console.log(`  ${index+1}. ${id}`));
                            }
                        } catch (convertError) {
                            console.log(`转换为字符串失败: ${convertError.message}`);
                        }
                    }
                } catch (parseError) {
                    console.log(`解析版本ID列表失败: ${parseError.message}`);
                }
            }
            
            // 增强返回结果，确保包含这些关键信息
            return {
                ...parsedResp, 
                _state: parsedResp.hasOwnProperty('failureType') ? 'failure' : 'success',
                _extractedInfo: {
                    appName: song.metadata.bundleDisplayName,
                    version: song.metadata.bundleShortVersionString,
                    versionId: versionId,
                    downloadBytes: song.metadata.downloadBytes,
                    allMetadata: song.metadata,
                    versionIdList: versionIdList
                }
            };
        }
        
        return {...parsedResp, _state: parsedResp.hasOwnProperty('failureType') ? 'failure' : 'success'};
    }

}

Store.cookieJar = new fetchCookie.toughCookie.CookieJar();
Store.fetch = fetchCookie(nodeFetch, Store.cookieJar);
Store.Headers = {
    'User-Agent': 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8',
    'Content-Type': 'application/x-www-form-urlencoded',
};
export {Store};
