export const CAPTCHA_PATTERNS = [
  /captcha/i,
  /验证码/i,
  /验证图片/i,
  /verify.?code/i,
  /security.?code/i,
  /robot.?check/i,
  /不是机器人/i,
  /我不是机器人/i,
  /prove.?you.*human/i,
  /点击验证/i,
  /滑动验证/i,
  /拼图验证/i,
  /请完成验证/i,
  /完成验证/i,
];

export const CAPTCHA_TYPE_PATTERNS = [
  { pattern: /滑动验证|滑块/, type: 'slider' },
  { pattern: /点选|点击验证/, type: 'click' },
  { pattern: /图片验证|图形验证/, type: 'image' },
  { pattern: /短信|手机验证/, type: 'sms' },
  { pattern: /邮箱|邮件验证/, type: 'email' },
];

export const POPUP_PATTERNS = [
  /cookie/i,
  /隐私政策/i,
  /subscribe/i,
  /订阅/i,
  /年龄验证/i,
  /age.?verify/i,
  /欢迎订阅/i,
  /notification/i,
  /通知/i,
  /modal/i,
  /dialog/i,
  /overlay/i,
  /遮罩/i,
  /弹窗/i,
];

export const BLOCK_PATTERNS = [
  /403/i,
  /404/i,
  /access.?denied/i,
  /禁止访问/i,
  /页面不存在/i,
  /not.?found/i,
  /forbidden/i,
  /ip.?blocked/i,
  /ip.?banned/i,
  /机器人验证/i,
  /bot.?detect/i,
  /reject/i,
  /refuse/i,
];

export const ERROR_PATTERNS = [
  /网络错误/i,
  /network.?error/i,
  /timeout/i,
  /超时/i,
  /加载失败/i,
  /failed.?load/i,
  /系统错误/i,
  /system.?error/i,
  /500/i,
  /internal.?error/i,
  /error/i,
];
