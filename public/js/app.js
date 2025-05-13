// 应用状态
const state = {
    currentPage: 'downloadPage',
    accounts: [],
    currentAccount: null,
    downloadProgress: null,
    isDownloading: false,
    appVersions: [] // 存储应用版本信息
};

// 缓存DOM元素
const elements = {
    // 页面
    accountsPage: document.getElementById('accountsPage'),
    loginPage: document.getElementById('loginPage'),
    downloadPage: document.getElementById('downloadPage'),
    
    // 账号管理
    accountsBtn: document.getElementById('accountsBtn'),
    accountList: document.getElementById('accountList'),
    addAccountBtn: document.getElementById('addAccountBtn'),
    backToMainFromAccounts: document.getElementById('backToMainFromAccounts'),
    
    // 登录
    appleIdInput: document.getElementById('appleId'),
    passwordInput: document.getElementById('password'),
    loginBtn: document.getElementById('loginBtn'),
    verificationCodeContainer: document.getElementById('verificationCodeContainer'),
    verificationCodeInput: document.getElementById('verificationCode'),
    submitVerificationBtn: document.getElementById('submitVerificationBtn'),
    loginMessage: document.getElementById('loginMessage'),
    backToAccountsFromLogin: document.getElementById('backToAccountsFromLogin'),
    
    // 下载
    currentAccount: document.getElementById('currentAccount'),
    appIdInput: document.getElementById('appId'),
    searchAppIconBtn: document.getElementById('searchAppIconBtn'),
    searchAppBtn: document.getElementById('searchAppBtn'),
    searchAllVersionsBtn: document.getElementById('searchAllVersionsBtn'),
    appInfoContainer: document.getElementById('appInfoContainer'),
    appNameInfo: document.getElementById('appNameInfo'),
    appInfo: document.getElementById('appInfo'),
    versionSelect: document.getElementById('versionSelect'),
    appVerId: document.getElementById('appVerId'),
    appVerIdInput: document.getElementById('appVerId'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadProgress: document.getElementById('downloadProgress'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    downloadResult: document.getElementById('downloadResult'),
    appNameResult: document.getElementById('appNameResult'),
    versionResult: document.getElementById('versionResult'),
    fileSizeResult: document.getElementById('fileSizeResult'),
    downloadLink: document.getElementById('downloadLink'),
    downloadError: document.getElementById('downloadError'),
    appVersionsContainer: document.getElementById('appVersionsContainer'),
    
    // 其他
    toastContainer: document.getElementById('toastContainer')
};

// API调用函数
const api = {
    async getAccounts() {
        try {
            const response = await fetch('/api/accounts');
            const data = await response.json();
            return data.accounts;
        } catch (error) {
            showToast('获取账号列表失败');
            console.error('获取账号列表失败:', error);
            return [];
        }
    },
    
    async checkAuth(appleId) {
        try {
            const response = await fetch('/api/check-auth', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ appleId })
            });
            return await response.json();
        } catch (error) {
            console.error('检查认证状态失败:', error);
            return { authenticated: false };
        }
    },
    
    async authStep1(appleId, password) {
        try {
            elements.loginBtn.disabled = true;
            elements.loginBtn.textContent = '登录中...';
            
            const response = await fetch('/api/auth-step1', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ appleId, password })
            });
            
            const data = await response.json();
            
            elements.loginBtn.disabled = false;
            elements.loginBtn.textContent = '登录';
            
            return data;
        } catch (error) {
            elements.loginBtn.disabled = false;
            elements.loginBtn.textContent = '登录';
            
            console.error('第一步认证失败:', error);
            return { success: false, error: '网络错误或服务器异常' };
        }
    },
    
    async authStep2(appleId, verificationCode) {
        try {
            elements.submitVerificationBtn.disabled = true;
            elements.submitVerificationBtn.textContent = '验证中...';
            
            const response = await fetch('/api/auth-step2', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ appleId, verificationCode })
            });
            
            const data = await response.json();
            
            elements.submitVerificationBtn.disabled = false;
            elements.submitVerificationBtn.textContent = '验证';
            
            return data;
        } catch (error) {
            elements.submitVerificationBtn.disabled = false;
            elements.submitVerificationBtn.textContent = '验证';
            
            console.error('验证码认证失败:', error);
            return { success: false, error: '网络错误或服务器异常' };
        }
    },
    
    async deleteAccount(appleId) {
        try {
            const response = await fetch(`/api/accounts/${appleId}`, {
                method: 'DELETE'
            });
            return await response.json();
        } catch (error) {
            console.error('删除账号失败:', error);
            return { success: false, error: '网络错误或服务器异常' };
        }
    },
    
    async queryVersions(appleId, appId) {
        try {
            elements.searchAppBtn.disabled = true;
            elements.searchAppBtn.textContent = '搜索中...';
            
            const response = await fetch('/api/query-versions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ appleId, appId })
            });
            
            const data = await response.json();
            
            elements.searchAppBtn.disabled = false;
            elements.searchAppBtn.textContent = '🔍';
            
            return data;
        } catch (error) {
            elements.searchAppBtn.disabled = false;
            elements.searchAppBtn.textContent = '🔍';
            
            console.error('查询版本信息失败:', error);
            return { success: false, error: '网络错误或服务器异常' };
        }
    },
    
    async downloadApp(appleId, appId, appVerId) {
        try {
            elements.downloadBtn.disabled = true;
            elements.downloadBtn.textContent = '准备下载...';
            
            showElement(elements.downloadProgress);
            hideElement(elements.downloadResult);
            hideElement(elements.downloadError);
            
            state.isDownloading = true;
            updateProgress(0, '准备下载...');
            
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ appleId, appId, appVerId })
            });
            
            const data = await response.json();
            
            elements.downloadBtn.disabled = false;
            elements.downloadBtn.textContent = '下载';
            state.isDownloading = false;
            
            return data;
        } catch (error) {
            elements.downloadBtn.disabled = false;
            elements.downloadBtn.textContent = '下载';
            state.isDownloading = false;
            
            console.error('下载应用失败:', error);
            return { success: false, error: '网络错误或服务器异常' };
        }
    }
};

// 页面导航
function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(pageId).classList.add('active');
    state.currentPage = pageId;
}

// 渲染账号列表
function renderAccountList(accounts) {
    const accountList = elements.accountList;
    
    if (accounts.length === 0) {
        accountList.innerHTML = `
            <div class="empty-state">
                <p>暂无账号，请添加Apple ID</p>
            </div>
        `;
        return;
    }
    
    accountList.innerHTML = '';
    
    accounts.forEach(account => {
        const accountItem = document.createElement('div');
        accountItem.className = 'account-item';
        
        accountItem.innerHTML = `
            <div class="account-info">
                <div class="account-email">${account.appleId}</div>
                ${account.userName ? `<div class="account-name">${account.userName}</div>` : ''}
            </div>
            <div class="account-actions">
                <button class="use-account-btn button secondary-button" data-apple-id="${account.appleId}">使用</button>
                <button class="delete-account-btn button secondary-button" data-apple-id="${account.appleId}">删除</button>
            </div>
        `;
        
        accountList.appendChild(accountItem);
    });
    
    // 添加事件监听
    document.querySelectorAll('.use-account-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const appleId = this.getAttribute('data-apple-id');
            selectAccount(appleId);
        });
    });
    
    document.querySelectorAll('.delete-account-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const appleId = this.getAttribute('data-apple-id');
            await deleteAccount(appleId);
        });
    });
}

// 选择账号
async function selectAccount(appleId) {
    const authResult = await api.checkAuth(appleId);
    
    if (authResult.authenticated) {
        state.currentAccount = state.accounts.find(acc => acc.appleId === appleId);
        updateCurrentAccountDisplay();
        navigateTo('downloadPage');
        showToast(`已切换到账号: ${appleId}`);
    } else {
        showToast('账号需要重新登录');
        startLogin(appleId);
    }
}

// 更新当前账号显示
function updateCurrentAccountDisplay() {
    if (state.currentAccount && state.currentAccount.authenticated) {
        elements.currentAccount.innerHTML = `
            <p>当前账号: <strong>${state.currentAccount.appleId}</strong></p>
            ${state.currentAccount.userName ? `<p>用户名: ${state.currentAccount.userName}</p>` : ''}
        `;
        elements.downloadBtn.disabled = false;
    } else {
        elements.currentAccount.innerHTML = `<p>当前未登录账号</p>`;
        elements.downloadBtn.disabled = true;
    }
}

// 开始登录流程
function startLogin(appleId = '') {
    elements.appleIdInput.value = appleId;
    elements.passwordInput.value = '';
    elements.verificationCodeInput.value = '';
    hideElement(elements.verificationCodeContainer);
    hideElement(elements.submitVerificationBtn);
    showElement(elements.loginBtn);
    elements.loginMessage.className = 'login-message';
    elements.loginMessage.textContent = '';
    
    navigateTo('loginPage');
}

// 删除账号
async function deleteAccount(appleId) {
    if (!confirm(`确定要删除账号 ${appleId} 吗？`)) {
        return;
    }
    
    const result = await api.deleteAccount(appleId);
    
    if (result.success) {
        await loadAccounts();
        
        if (state.currentAccount && state.currentAccount.appleId === appleId) {
            state.currentAccount = null;
            updateCurrentAccountDisplay();
        }
        
        showToast(`已删除账号: ${appleId}`);
    } else {
        showToast('删除账号失败');
    }
}

// 查询应用版本信息
async function queryAppVersions(appId) {
    if (!state.currentAccount || !state.currentAccount.authenticated) {
        showToast('请先登录账号');
        navigateTo('accountsPage');
        return false;
    }
    
    if (!appId) {
        showToast('请输入应用ID');
        return false;
    }
    
    const result = await api.queryVersions(state.currentAccount.appleId, appId);
    
    if (result.success) {
        // 显示应用信息
        const versionInfo = result.versionInfo;
        state.appVersions = versionInfo;
        
        elements.appNameInfo.textContent = versionInfo.appName || '未知应用';
        
        // 清空现有选项
        elements.versionSelect.innerHTML = '';
        
        // 添加当前版本
        const currentOption = document.createElement('option');
        currentOption.value = versionInfo.currentVersion.versionId;
        currentOption.textContent = `${versionInfo.currentVersion.version} (最新版)`;
        elements.versionSelect.appendChild(currentOption);
        
        // 添加历史版本
        if (versionInfo.availableVersions && versionInfo.availableVersions.length > 0) {
            versionInfo.availableVersions.forEach(version => {
                const option = document.createElement('option');
                option.value = version.versionId;
                option.textContent = `${version.version}`;
                elements.versionSelect.appendChild(option);
            });
        }
        
        // 显示应用详情
        elements.appInfo.innerHTML = `
            <p>当前版本: ${versionInfo.currentVersion.version}</p>
            <p>大小: ${formatFileSize(versionInfo.currentVersion.size)}</p>
            ${versionInfo.releaseNotes ? `<p>更新说明: ${versionInfo.releaseNotes}</p>` : ''}
        `;
        
        // 自动填充版本ID
        elements.appVerIdInput.value = versionInfo.currentVersion.versionId;
        
        // 显示应用信息容器
        showElement(elements.appInfoContainer);
        
        // 渲染新版本列表UI
        window.appVersions.renderVersionInfo('appVersionsContainer', versionInfo);
        showElement(document.getElementById('appVersionsContainer'));
        
        return true;
    } else {
        showToast(result.error || '查询应用信息失败');
        hideElement(elements.appInfoContainer);
        return false;
    }
}

// 更新下载进度
function updateProgress(percent, text) {
    elements.progressBar.style.width = `${percent}%`;
    elements.progressText.textContent = text || `${percent}%`;
}

// 显示下载结果
function showDownloadResult(data) {
    elements.appNameResult.textContent = `应用名称: ${data.appName}`;
    elements.versionResult.textContent = `版本: ${data.version}`;
    elements.downloadLink.href = data.downloadLink;
    
    if (data.fileSize) {
        elements.fileSizeResult.textContent = `大小: ${formatFileSize(data.fileSize)}`;
        showElement(elements.fileSizeResult);
    } else {
        hideElement(elements.fileSizeResult);
    }
    
    // 如果有OTA链接，添加OTA安装部分
    const otaContainer = document.getElementById('otaInstallContainer');
    if (otaContainer) {
        if (data.otaLink) {
            // 移除旧内容
            otaContainer.innerHTML = '';
            
            // 创建OTA安装部分
            const otaSection = document.createElement('div');
            otaSection.className = 'ota-section';
            
            // 标题
            const heading = document.createElement('h4');
            heading.textContent = 'iOS设备OTA安装';
            otaSection.appendChild(heading);
            
            // 说明
            const description = document.createElement('p');
            description.textContent = '点击下面的链接可直接在iOS设备上安装此应用:';
            otaSection.appendChild(description);
            
            // 安装按钮
            const otaButton = document.createElement('a');
            otaButton.href = data.otaLink;
            otaButton.className = 'ota-button';
            otaButton.textContent = '点击在iOS设备上安装';
            otaSection.appendChild(otaButton);
            
            // 警告提示
            const warning = document.createElement('p');
            warning.className = 'ota-warning';
            warning.textContent = '注意: 必须在iOS设备上点击此链接才能安装';
            otaSection.appendChild(warning);
            
            // 附加说明
            const note = document.createElement('p');
            note.className = 'ota-note';
            note.textContent = '如果您使用的是Safari浏览器，链接可能会直接触发安装。如果使用其他浏览器，可能需要先复制链接再在Safari中打开。';
            otaSection.appendChild(note);
            
            // 添加OTA安装部分
            otaContainer.appendChild(otaSection);
            showElement(otaContainer);
        } else {
            hideElement(otaContainer);
        }
    }
    
    hideElement(elements.downloadProgress);
    showElement(elements.downloadResult);
}

// 显示下载错误
function showDownloadError(error) {
    elements.downloadError.textContent = error;
    showElement(elements.downloadError);
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示/隐藏元素
function showElement(element) {
    element.classList.remove('hidden');
}

function hideElement(element) {
    element.classList.add('hidden');
}

// 显示提示信息
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    
    // 如果容器不存在则创建
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    document.getElementById('toast-container').appendChild(toast);
    
    // 自动消失
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// 将showToast添加到全局作用域
window.showToast = showToast;

// 加载账号列表
async function loadAccounts() {
    const accounts = await api.getAccounts();
    state.accounts = accounts;
    renderAccountList(accounts);
    
    // 如果当前账号在列表中不存在，重置当前账号
    if (state.currentAccount && !accounts.find(acc => acc.appleId === state.currentAccount.appleId)) {
        state.currentAccount = null;
    }
    
    updateCurrentAccountDisplay();
    
    return accounts;
}

// 版本选择器事件处理
function handleVersionSelect() {
    elements.appVerIdInput.value = elements.versionSelect.value;
}

// 显示加载状态
function showLoading(message = '加载中...') {
    // 检查是否有加载指示器元素
    let loadingElement = document.getElementById('loading-indicator');
    
    // 如果没有，创建一个
    if (!loadingElement) {
        loadingElement = document.createElement('div');
        loadingElement.id = 'loading-indicator';
        loadingElement.className = 'loading-indicator';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        loadingElement.appendChild(spinner);
        
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.id = 'loading-text';
        loadingElement.appendChild(loadingText);
        
        document.body.appendChild(loadingElement);
    }
    
    // 更新加载文本
    const loadingText = document.getElementById('loading-text');
    if (loadingText) {
        loadingText.textContent = message;
    }
    
    // 显示加载指示器
    loadingElement.style.display = 'flex';
}

// 隐藏加载状态
function hideLoading() {
    const loadingElement = document.getElementById('loading-indicator');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// 将函数添加到全局作用域
window.showDownloadResult = showDownloadResult;
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// 准备OTA安装
async function prepareOtaInstall(appleId, appId, appVerId) {
    try {
        showLoading('准备OTA安装...');
        
        const response = await fetch('/api/prepare-ota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appleId, appId, appVerId })
        });
        
        if (!response.ok) {
            throw new Error(`请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            showDownloadResult(data);
            showToast('已生成OTA安装链接');
        } else {
            showToast(`生成OTA安装链接失败: ${data.error}`, 'error');
        }
        
        return data;
    } catch (error) {
        hideLoading();
        showToast(`准备OTA安装失败: ${error.message}`, 'error');
        console.error('准备OTA安装错误:', error);
        throw error;
    }
}

// 将函数添加到全局作用域
window.prepareOtaInstall = prepareOtaInstall;

// 初始化
async function init() {
    // 加载账号列表
    await loadAccounts();
    
    // 事件监听
    // 账号管理
    elements.accountsBtn.addEventListener('click', () => {
        navigateTo('accountsPage');
    });
    
    elements.addAccountBtn.addEventListener('click', () => {
        startLogin();
    });
    
    elements.backToMainFromAccounts.addEventListener('click', () => {
        navigateTo('downloadPage');
    });
    
    // 登录
    elements.loginBtn.addEventListener('click', async () => {
        const appleId = elements.appleIdInput.value.trim();
        const password = elements.passwordInput.value.trim();
        
        if (!appleId || !password) {
            elements.loginMessage.textContent = '请输入Apple ID和密码';
            elements.loginMessage.className = 'login-message error';
            return;
        }
        
        const result = await api.authStep1(appleId, password);
        
        if (result.success) {
            if (result.needsVerification) {
                // 需要验证码
                showElement(elements.verificationCodeContainer);
                hideElement(elements.loginBtn);
                showElement(elements.submitVerificationBtn);
                elements.loginMessage.textContent = '请查看您的设备，输入收到的验证码';
                elements.loginMessage.className = 'login-message';
            } else {
                // 登录成功，无需验证码
                elements.loginMessage.textContent = '登录成功！';
                elements.loginMessage.className = 'login-message success';
                
                await loadAccounts();
                selectAccount(appleId);
            }
        } else {
            elements.loginMessage.textContent = result.error || '登录失败，请检查账号和密码';
            elements.loginMessage.className = 'login-message error';
        }
    });
    
    elements.submitVerificationBtn.addEventListener('click', async () => {
        const appleId = elements.appleIdInput.value.trim();
        const verificationCode = elements.verificationCodeInput.value.trim();
        
        if (!verificationCode) {
            elements.loginMessage.textContent = '请输入验证码';
            elements.loginMessage.className = 'login-message error';
            return;
        }
        
        const result = await api.authStep2(appleId, verificationCode);
        
        if (result.success) {
            elements.loginMessage.textContent = '验证成功！';
            elements.loginMessage.className = 'login-message success';
            
            await loadAccounts();
            selectAccount(appleId);
        } else {
            elements.loginMessage.textContent = result.error || '验证失败，请检查验证码';
            elements.loginMessage.className = 'login-message error';
        }
    });
    
    elements.backToAccountsFromLogin.addEventListener('click', () => {
        navigateTo('accountsPage');
    });
    
    // 应用查询
    elements.searchAppIconBtn.addEventListener('click', async () => {
        const appId = elements.appIdInput.value.trim();
        
        if (!state.currentAccount || !state.currentAccount.authenticated) {
            showToast('请先登录账号');
            navigateTo('accountsPage');
            return;
        }
        
        if (!appId) {
            showToast('请输入应用ID');
            return;
        }
        
        // 显示加载状态
        elements.searchAppIconBtn.disabled = true;
        elements.searchAppIconBtn.textContent = '...';
        
        try {
            // 使用查询所有版本的接口获取更完整的版本信息
            const result = await window.appVersions.listAllVersions(
                state.currentAccount.appleId, 
                appId
            );
            
            const versionInfo = result.versionInfo;
            
            // 添加安全检查，确保versionInfo存在且包含必要属性
            if (!versionInfo) {
                console.error('无法获取版本信息');
                showToast('无法获取版本信息，请重试', 'error');
                return;
            }
            
            // 更新旧版UI组件（保持兼容）
            elements.appNameInfo.textContent = versionInfo.appName || '未知应用';
            elements.versionSelect.innerHTML = '';
            
            // 添加当前版本到下拉框
            const currentOption = document.createElement('option');
            currentOption.value = versionInfo.currentVersion.versionId;
            currentOption.textContent = `${versionInfo.currentVersion.version} (最新版)`;
            elements.versionSelect.appendChild(currentOption);
            
            // 添加历史版本到下拉框
            if (versionInfo.availableVersions && versionInfo.availableVersions.length > 0) {
                versionInfo.availableVersions.forEach(version => {
                    if (version.versionId !== versionInfo.currentVersion.versionId) {
                        const option = document.createElement('option');
                        option.value = version.versionId;
                        option.textContent = `${version.version}`;
                        elements.versionSelect.appendChild(option);
                    }
                });
            }
            
            // 更新应用详情
            elements.appInfo.innerHTML = `
                <p>当前版本: ${versionInfo.currentVersion.version}</p>
                <p>大小: ${formatFileSize(versionInfo.currentVersion.size)}</p>
                ${versionInfo.releaseNotes ? `<p>更新说明: ${versionInfo.releaseNotes}</p>` : ''}
                <p>可用版本数量: ${versionInfo.availableVersions ? versionInfo.availableVersions.length : 1}</p>
                ${result.message ? `<p>${result.message}</p>` : ''}
            `;
            
            // 自动填充版本ID
            elements.appVerIdInput.value = versionInfo.currentVersion.versionId;
            
            // 显示应用信息容器
            showElement(elements.appInfoContainer);
            
            // 渲染新版本列表UI
            window.appVersions.renderVersionInfo('appVersionsContainer', versionInfo);
            showElement(elements.appVersionsContainer);
            
            // 成功提示
            showToast(`已获取"${versionInfo.appName}"的版本信息`);
        } catch (error) {
            console.error('查询应用版本失败:', error);
            showToast(`查询失败: ${error.message}`);
        } finally {
            // 恢复按钮状态
            elements.searchAppIconBtn.disabled = false;
            elements.searchAppIconBtn.textContent = '🔍';
        }
    });
    
    elements.searchAppBtn.addEventListener('click', async () => {
        const appId = elements.appIdInput.value.trim();
        
        if (!state.currentAccount || !state.currentAccount.authenticated) {
            showToast('请先登录账号');
            navigateTo('accountsPage');
            return;
        }
        
        if (!appId) {
            showToast('请输入应用ID');
            return;
        }
        
        // 显示加载状态
        elements.searchAppBtn.disabled = true;
        elements.searchAppBtn.textContent = '搜索中...';
        
        try {
            // 使用查询所有版本的接口获取更完整的版本信息
            const result = await window.appVersions.listAllVersions(
                state.currentAccount.appleId, 
                appId
            );
            
            const versionInfo = result.versionInfo;
            
            // 添加安全检查，确保versionInfo存在且包含必要属性
            if (!versionInfo) {
                console.error('无法获取版本信息');
                showToast('无法获取版本信息，请重试', 'error');
                return;
            }
            
            // 更新旧版UI组件（保持兼容）
            elements.appNameInfo.textContent = versionInfo.appName || '未知应用';
            elements.versionSelect.innerHTML = '';
            
            // 添加当前版本到下拉框
            const currentOption = document.createElement('option');
            currentOption.value = versionInfo.currentVersion.versionId;
            currentOption.textContent = `${versionInfo.currentVersion.version} (最新版)`;
            elements.versionSelect.appendChild(currentOption);
            
            // 添加历史版本到下拉框
            if (versionInfo.availableVersions && versionInfo.availableVersions.length > 0) {
                versionInfo.availableVersions.forEach(version => {
                    if (version.versionId !== versionInfo.currentVersion.versionId) {
                        const option = document.createElement('option');
                        option.value = version.versionId;
                        option.textContent = `${version.version}`;
                        elements.versionSelect.appendChild(option);
                    }
                });
            }
            
            // 更新应用详情
            elements.appInfo.innerHTML = `
                <p>当前版本: ${versionInfo.currentVersion.version}</p>
                <p>大小: ${formatFileSize(versionInfo.currentVersion.size)}</p>
                ${versionInfo.releaseNotes ? `<p>更新说明: ${versionInfo.releaseNotes}</p>` : ''}
                <p>可用版本数量: ${versionInfo.availableVersions ? versionInfo.availableVersions.length : 1}</p>
                ${result.message ? `<p>${result.message}</p>` : ''}
            `;
            
            // 自动填充版本ID
            elements.appVerIdInput.value = versionInfo.currentVersion.versionId;
            
            // 显示应用信息容器
            showElement(elements.appInfoContainer);
            
            // 渲染新版本列表UI
            window.appVersions.renderVersionInfo('appVersionsContainer', versionInfo);
            showElement(elements.appVersionsContainer);
            
            // 成功提示
            showToast(`已获取"${versionInfo.appName}"的版本信息`);
        } catch (error) {
            console.error('查询应用版本失败:', error);
            showToast(`查询失败: ${error.message}`);
        } finally {
            // 恢复按钮状态
            elements.searchAppBtn.disabled = false;
            elements.searchAppBtn.textContent = '查询应用版本';
        }
    });
    
    // 版本选择
    elements.versionSelect.addEventListener('change', handleVersionSelect);
    
    // 下载
    elements.downloadBtn.addEventListener('click', async () => {
        if (!state.currentAccount || !state.currentAccount.authenticated) {
            showToast('请先选择或添加账号');
            navigateTo('accountsPage');
            return;
        }
        
        const appId = elements.appIdInput.value.trim();
        const appVerId = elements.appVerIdInput.value.trim();
        
        if (!appId) {
            showToast('请输入应用ID');
            return;
        }
        
        const result = await api.downloadApp(state.currentAccount.appleId, appId, appVerId);
        
        if (result.success) {
            showDownloadResult(result);
            
            // 尝试准备OTA安装
            try {
                await prepareOtaInstall(state.currentAccount.appleId, appId, appVerId);
            } catch (otaError) {
                console.error('OTA准备失败，但不影响正常下载:', otaError);
            }
            
            showToast('下载完成！');
        } else {
            hideElement(elements.downloadProgress);
            showDownloadError(result.error || '下载失败，请重试');
            
            // 如果是版本不可用的错误
            if (result.errorType === 'VERSION_NOT_AVAILABLE') {
                showToast('请求的版本不可用，请尝试下载最新版本或其他版本', 5000);
            }
        }
    });
    
    // 添加移动设备支持
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
        });
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', init);