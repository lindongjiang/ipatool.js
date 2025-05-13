// 应用版本查询工具
const appVersions = {
    // 缓存查询结果
    cache: {},
    
    // 查询应用版本信息
    async searchAppVersions(appleId, appId) {
        console.log('开始查询应用版本，参数:', { appleId, appId });
        if (!appleId || !appId) {
            console.error('参数错误: 缺少Apple ID或应用ID');
            throw new Error('需要Apple ID和应用ID');
        }
        
        // 查询缓存
        const cacheKey = `${appleId}_${appId}`;
        if (this.cache[cacheKey]) {
            console.log('从缓存中获取应用信息:', this.cache[cacheKey]);
            return this.cache[cacheKey];
        }
        
        try {
            console.log('发送请求到 /api/app-versions');
            const response = await fetch('/api/app-versions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ appleId, appId })
            });
            
            console.log('收到响应:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('请求失败:', response.status, response.statusText);
                throw new Error(`查询失败: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('解析响应数据:', data);
            
            if (!data.success) {
                console.error('服务器返回错误:', data.error);
                throw new Error(data.error || '查询失败');
            }
            
            // 缓存结果
            this.cache[cacheKey] = data.versionInfo;
            console.log('成功获取应用版本信息:', data.versionInfo);
            
            return data.versionInfo;
        } catch (error) {
            console.error('查询应用版本失败:', error);
            throw error;
        }
    },
    
    // 查询应用的所有可用版本
    async listAllVersions(appleId, appId) {
        console.log('开始查询应用所有版本，参数:', { appleId, appId });
        if (!appleId || !appId) {
            console.error('参数错误: 缺少Apple ID或应用ID');
            throw new Error('需要Apple ID和应用ID');
        }
        
        // 查询缓存 (使用不同的缓存键以区分普通查询和完整版本列表查询)
        const cacheKey = `full_${appleId}_${appId}`;
        if (this.cache[cacheKey]) {
            console.log('从缓存中获取应用完整版本列表:', this.cache[cacheKey]);
            return this.cache[cacheKey];
        }
        
        try {
            console.log('发送请求到 /api/query-versions 端点');
            const response = await fetch('/api/query-versions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ appleId, appId })
            });
            
            console.log('收到响应:', response.status, response.statusText);
            
            if (!response.ok) {
                console.error('请求失败:', response.status, response.statusText);
                throw new Error(`查询失败: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('解析响应数据:', data);
            
            if (!data.success) {
                console.error('服务器返回错误:', data.error);
                throw new Error(data.error || '查询失败');
            }
            
            // 缓存结果
            this.cache[cacheKey] = data.versionInfo;
            console.log('成功获取应用完整版本列表:', data.versionInfo);
            console.log('服务器消息:', data.message);
            
            return {
                versionInfo: data.versionInfo,
                message: data.message
            };
        } catch (error) {
            console.error('查询应用完整版本列表失败:', error);
            throw error;
        }
    },
    
    // 格式化大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // 格式化日期
    formatDate(dateString) {
        if (!dateString) return '';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (e) {
            return dateString || '';
        }
    },
    
    // 对版本号进行解析，用于排序
    parseVersion(versionString) {
        if (!versionString) return [0];
        
        // 处理不同格式的版本号输入
        // 如果版本号是"版本 X"格式，尝试提取数字部分
        if (typeof versionString === 'string' && versionString.startsWith('版本 ')) {
            versionString = versionString.substring(3).trim();
        }
        
        // 移除非数字和点之外的字符
        const cleanVersion = versionString.toString().replace(/[^\d.]/g, '');
        
        // 避免空字符串的情况
        if (!cleanVersion) return [0];
        
        // 分割版本号并转换为数字数组
        return cleanVersion.split('.').map(part => parseInt(part, 10) || 0);
    },
    
    // 比较两个版本号，用于排序
    compareVersions(a, b) {
        // 安全处理：如果版本是undefined或null，转为空字符串
        const versionA = a?.version || '';
        const versionB = b?.version || '';
        
        console.log(`比较版本: "${versionA}" vs "${versionB}"`);
        
        const partsA = this.parseVersion(versionA);
        const partsB = this.parseVersion(versionB);
        
        console.log(`分解后: ${partsA.join('.')} vs ${partsB.join('.')}`);
        
        // 逐段比较版本号
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
            const partA = partsA[i] || 0;
            const partB = partsB[i] || 0;
            
            if (partA !== partB) {
                return partB - partA; // 降序排列，新版本在前
            }
        }
        
        // 版本号完全相同，则按照其他指标排序
        
        // 如果有versionId，则也可以按照versionId排序
        if (a?.versionId && b?.versionId) {
            const idA = parseInt(a.versionId) || 0;
            const idB = parseInt(b.versionId) || 0;
            
            if (idA !== idB) {
                return idB - idA; // 同样降序
            }
        }
        
        // 如果有purchaseDate，则按照日期降序排列
        if (a?.purchaseDate && b?.purchaseDate) {
            const dateA = new Date(a.purchaseDate);
            const dateB = new Date(b.purchaseDate);
            
            if (dateA && dateB && !isNaN(dateA) && !isNaN(dateB)) {
                return dateB - dateA; // 降序，新日期在前
            }
        }
        
        return 0;
    },
    
    // 格式化版本号显示
    formatVersionNumber(version) {
        // 直接返回原始版本号，不做处理
        return version;
    },
    
    // 渲染版本信息到页面
    renderVersionInfo(containerId, versionInfo) {
        console.log('开始渲染版本信息到容器:', containerId);
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('未找到容器元素:', containerId);
            return;
        }
        
        // 添加安全检查，确保versionInfo包含必要的属性
        if (!versionInfo || !versionInfo.currentVersion) {
            console.error('版本信息不完整:', versionInfo);
            container.innerHTML = '<div class="error-message">无法加载版本信息</div>';
            return;
        }
        
        const appName = versionInfo.appName || '未知应用';
        console.log('渲染的版本信息:', versionInfo);
        
        // 添加版本排序提示和API限制说明
        let html = `
            <div class="app-info-header">
                <h3>${appName}</h3>
                <p class="version-order-hint">按照版本ID排序展示，版本ID越大表示版本越新</p>
                <div class="api-limitation-warning">
                    <p><strong>苹果API限制说明：</strong>由于苹果App Store API的限制，只有最新版本能获取到完整的版本号信息（如4.1.0）。历史版本只能获取到版本ID，无法获取实际版本号。</p>
                </div>
            </div>
            <div class="version-list">
        `;
        
        // 合并当前版本和所有历史版本
        let allVersions = [];
        
        // 确保currentVersion有效
        if (versionInfo.currentVersion && versionInfo.currentVersion.versionId) {
            // 标记当前版本
            versionInfo.currentVersion.isCurrent = true;
            allVersions.push(versionInfo.currentVersion);
        }
        
        // 如果有availableVersions，添加到列表
        if (versionInfo.availableVersions && Array.isArray(versionInfo.availableVersions) && versionInfo.availableVersions.length > 0) {
            // 过滤掉重复的版本（与当前版本相同的）
            const filteredVersions = versionInfo.availableVersions.filter(
                version => version && version.versionId && 
                (!versionInfo.currentVersion || version.versionId !== versionInfo.currentVersion.versionId)
            );
            
            console.log(`过滤后的历史版本: ${filteredVersions.length}个`);
            allVersions = allVersions.concat(filteredVersions);
        }
        
        console.log(`合并后共有${allVersions.length}个版本准备排序`);
        
        // 按版本ID从高到低排序（更大的ID通常代表更新的版本）
        if (allVersions.length > 1) {
            try {
                allVersions.sort((a, b) => {
                    const idA = parseInt(a.versionId, 10) || 0;
                    const idB = parseInt(b.versionId, 10) || 0;
                    return idB - idA; // 降序排序
                });
                console.log('版本按ID排序完成');
            } catch (error) {
                console.error('版本排序出错:', error);
            }
        }
        
        console.log('排序后的版本列表:', allVersions.map(v => `${v.version} (ID: ${v.versionId})`));
        
        // 渲染版本列表
        allVersions.forEach((version, index) => {
            const isCurrent = version.isCurrent || (versionInfo.currentVersion && version.versionId === versionInfo.currentVersion.versionId);
            
            // 为了更清晰地区分，如果是当前版本或者有语义化版本号就显示版本号，否则显示"历史版本"并附上版本ID
            let displayVersionInfo;
            if (isCurrent || (version.version && !version.version.startsWith('版本 '))) {
                displayVersionInfo = `${version.version} ${isCurrent ? '(最新版)' : ''}`;
            } else {
                displayVersionInfo = `历史版本 (ID: ${version.versionId})`;
            }
            
            html += `
                <div class="version-item ${isCurrent ? 'current-version' : ''}">
                    <div class="version-info version-clickable" data-version-id="${version.versionId}" data-version="${version.version}">
                        <div class="version-header">
                            <div class="version-name">${displayVersionInfo}</div>
                            ${version.purchaseDate ? 
                                `<div class="version-date">上架时间: ${this.formatDate(version.purchaseDate)}</div>` : 
                                ''}
                        </div>
                        <div class="version-details">
                            <div class="version-id">版本ID: ${version.versionId}</div>
                            <div class="version-size">${this.formatFileSize(version.size || 0)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // 在列表末尾添加版本ID说明
        html += `
            </div>
            <div class="version-info-note">
                <p>注意: 对于历史版本，Apple API仅提供版本ID，没有提供具体的版本号，因此只能按ID排序显示。</p>
                <p>版本ID是唯一标识符，越大通常表示版本越新发布。如需下载特定历史版本，请点击相应版本行。</p>
            </div>
        `;
        
        if (versionInfo.releaseNotes) {
            console.log('添加发布说明');
            html += `
                <div class="release-notes">
                    <h4>更新说明</h4>
                    <p>${versionInfo.releaseNotes}</p>
                </div>
            `;
        }
        
        container.innerHTML = html;
        console.log('版本信息已渲染到DOM');
        
        // 添加点击版本信息的事件
        container.querySelectorAll('.version-clickable').forEach(versionElement => {
            versionElement.addEventListener('click', () => {
                const versionId = versionElement.getAttribute('data-version-id');
                const versionNumber = versionElement.getAttribute('data-version');
                console.log('选择版本ID:', versionId, '版本号:', versionNumber);
                
                // 设置版本ID到隐藏字段
                document.getElementById('appVerId').value = versionId;
                
                // 显示提示
                if (typeof window.showToast === 'function') {
                    // 如果有版本号就显示，否则只显示ID
                    const displayVersion = versionNumber && !versionNumber.startsWith('版本 ') ? 
                        versionNumber : `历史版本 (ID: ${versionId})`;
                    window.showToast(`正在准备下载 ${displayVersion}`);
                }
                
                // 直接触发下载
                this.downloadApp(versionId);
            });
        });
        console.log('版本点击事件已添加');
    },
    
    // 下载应用
    async downloadApp(versionId) {
        console.log('开始下载版本:', versionId);
        
        // 获取必要参数
        const appIdElement = document.getElementById('appId');
        const appleIdElement = document.getElementById('appleId');
        
        if (!appIdElement || !appleIdElement) {
            console.error('找不到必要的表单元素');
            if (typeof window.showToast === 'function') {
                window.showToast('无法下载：找不到应用ID或Apple ID', 'error');
            }
            return;
        }
        
        const appId = appIdElement.value;
        const appleId = appleIdElement.value;
        
        if (!appId || !appleId) {
            console.error('应用ID或Apple ID为空');
            if (typeof window.showToast === 'function') {
                window.showToast('无法下载：请先填写应用ID和Apple ID', 'error');
            }
            return;
        }
        
        try {
            // 显示加载状态
            if (typeof window.showLoading === 'function') {
                window.showLoading('正在下载...');
            }
            
            // 发送下载请求
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    appleId, 
                    appId, 
                    appVerId: versionId 
                })
            });
            
            if (!response.ok) {
                throw new Error(`下载请求失败: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '下载失败');
            }
            
            // 隐藏加载状态
            if (typeof window.hideLoading === 'function') {
                window.hideLoading();
            }
            
            // 如果获取到实际版本号，更新历史版本显示
            if (data.realVersion && data.versionId) {
                this.updateVersionDisplay(data.versionId, data.realVersion);
            }
            
            // 显示下载成功消息和链接
            if (typeof window.showDownloadResult === 'function') {
                window.showDownloadResult(data);
            } else {
                console.log('下载成功:', data);
                // 备用方法：如果showDownloadResult不存在，尝试直接跳转到下载链接
                if (data.downloadLink) {
                    window.open(data.downloadLink, '_blank');
                }
                
                if (typeof window.showToast === 'function') {
                    window.showToast(`下载成功: ${data.appName} ${data.version}`, 'success');
                }
            }
        } catch (error) {
            console.error('下载失败:', error);
            
            // 隐藏加载状态
            if (typeof window.hideLoading === 'function') {
                window.hideLoading();
            }
            
            // 显示错误消息
            if (typeof window.showToast === 'function') {
                window.showToast(`下载失败: ${error.message}`, 'error');
            }
        }
    },
    
    // 更新版本显示（当获取到实际版本号时）
    updateVersionDisplay(versionId, realVersion) {
        console.log(`获取到版本ID ${versionId} 的实际版本号: ${realVersion}`);
        
        // 查找具有这个版本ID的元素并更新显示
        const versionElements = document.querySelectorAll(`.version-info[data-version-id="${versionId}"]`);
        versionElements.forEach(element => {
            // 更新显示的版本号
            const versionNameElement = element.querySelector('.version-name');
            if (versionNameElement && versionNameElement.textContent.includes('历史版本')) {
                versionNameElement.innerHTML = `${realVersion} <span class="version-updated">(已验证)</span>`;
                // 设置实际版本号属性
                element.setAttribute('data-version', realVersion);
            }
            
            // 添加样式标记已获取真实版本号的条目
            element.classList.add('version-verified');
        });
    }
};

// 添加到全局作用域
window.appVersions = appVersions; 