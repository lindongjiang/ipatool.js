import {IPATool} from './src/ipa.js';
import readline from 'readline';
import {Store} from './src/client.js';

// 创建交互式命令行
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 主函数
async function main() {
  const ipaTool = new IPATool();
  
  // Apple ID和密码
  const APPLE_ID = '1641324393@qq.com';
  const PASSWORD = 'Lishuo12313018!';
  
  console.log('------第一步: 尝试登录以获取验证码------');
  // 首先尝试登录，这会触发Apple发送验证码
  const firstAttempt = await Store.authenticate(APPLE_ID, PASSWORD);
  
  if (firstAttempt._state === 'success') {
    console.log('登录成功，无需验证码');
    await downloadApp(ipaTool, APPLE_ID, PASSWORD);
  } else {
    console.log('需要验证码，请检查您的设备并输入收到的验证码:');
    
    // 等待用户输入验证码
    rl.question('请输入验证码: ', async (CODE) => {
      console.log(`收到验证码: ${CODE}，尝试重新登录...`);
      
      // 使用验证码完成下载
      await downloadApp(ipaTool, APPLE_ID, PASSWORD, CODE);
      rl.close();
    });
  }
}

// 下载应用函数
async function downloadApp(ipaTool, APPLE_ID, PASSWORD, CODE = '') {
  console.log('------下载参数配置------');
  
  // 定义下载参数
  const APPID = '6448982270';
  const appVerId = '856992393'; // 旧版本ID
  
  console.log(`APPID设置为: ${APPID}`);
  console.log(`appVerId设置为: ${appVerId || '未设置（将下载最新版本）'}`);
  
  // 尝试下载特定版本
  console.log('开始下载应用，请求指定版本...');
  
  await ipaTool.downipa({
    // 你想要保存文件的路径,留空为当前目录，比如当前目录下app目录【./app】
    path: './app',

    // 应用程序的ID
    APPID: APPID,

    // 版本id,下载旧版本需要填写,留空默认下新版本
    appVerId: appVerId,

    // Apple ID和验证信息
    APPLE_ID: APPLE_ID,
    PASSWORD: PASSWORD,
    CODE: CODE
  });
}

// 运行主函数
main().catch(error => {
  console.error('发生错误:', error);
  rl.close();
});

