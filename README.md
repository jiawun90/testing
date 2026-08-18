# JW Just Wishes 网站 — 部署与上线说明

这是一个可以真实收款的网站起点:静态网页(商品展示+购物车)+ 一个负责串接Stripe付款的后端小函数。

## 网站结构

```
jw-store/
├── index.html          首页
├── shop.html            商品总览页
├── how.html             How it works 页面
├── contact.html         联络我们页面
├── success.html         付款成功后显示的页面
├── styles.css            样式(延续品牌的奶油/橄榄绿/金色配色)
├── script.js              购物车逻辑、商品资料、结账请求、折扣码验证
├── api/
│   ├── create-checkout-session.js   建立Stripe付款连结,并核实/核销折扣码
│   ├── validate-discount.js          检查折扣码是否有效(给购物车"Apply"按钮用)
│   ├── generate-discount.js          管理员专用,生成新的独家折扣码(支援单个/批量/前缀流水号)
│   └── list-discounts.js             管理员专用,查看所有已生成的码、哪些用过了
└── package.json         后端函数需要用到的套件(stripe、@vercel/kv)
```

商品资料写死在 `script.js` 最上面的 `PRODUCTS` 陣列里,您可以直接修改名字、价格(单位是"分",1280 = S$12.80)、说明文字。之后如果商品变多,建议改成从Google Sheet或简单的数据库读取,现在先用这个方式起步最快。

---

## 第一步:开通Stripe账户(处理真实付款需要)

1. 前往 https://dashboard.stripe.com/register 注册(需要您的身份/银行资料做验证,这是真实收款必须的步骤)
2. 登入后,左侧选单找 **Developers → API keys**
3. 复制 **Secret key**(以 `sk_test_` 开头的是测试金钥,**先用这个**,不会有真实金流)
4. 完成Stripe账户的商家资料审核后,才能拿到 `sk_live_` 开头的正式金钥,到时候切换即可开始真实收款

## 第二步:把网站部署上线(推荐用 Vercel,免费且简单)

1. 前往 https://vercel.com 用GitHub或Email注册一个账号
2. 把这个 `jw-store` 文件夹上传成一个GitHub仓库(或直接把整个文件夹拖进Vercel网页版的部署界面,Vercel支持不用GitHub也能直接拖拽文件夹部署)
3. 部署时,Vercel会自动认出 `api/` 里的文件是后端函数,`index.html` 等其他文件是静态网页,不需要额外设置
4. 部署完成后,Vercel会给您一个类似 `jw-just-wishes.vercel.app` 的网址,可以先用这个网址测试

## 第三步:设置Stripe金钥

1. 在Vercel项目页面,找 **Settings → Environment Variables**
2. 新增一个变量:
   - Key: `STRIPE_SECRET_KEY`
   - Value: 贴上您从Stripe复制的 `sk_test_...` 金钥
3. 存好后,回到 Deployments 页面,点击 **Redeploy** 让设置生效

## 第四步:测试付款流程

金钥还是 `sk_test_` 开头时,不会真的收到钱,可以放心测试:
- 在网站上把商品加进购物车,点击Checkout
- 会跳转到Stripe的付款页面,输入测试卡号:`4242 4242 4242 4242`,任意未来日期、任意3位CVC
- 完成后应该会跳转到 `success.html` 确认页

## 第五步:正式上线收款

1. 回到Stripe後台,完成商家资料审核,拿到 `sk_live_` 开头的正式金钥
2. 回Vercel把 `STRIPE_SECRET_KEY` 的值换成 `sk_live_...` 那把,Redeploy
3. 之后网站上的付款就是真实交易了,钱会进到您Stripe账户,可以设定自动转到您的新加坡银行账户

## 第六步(可选):绑定您自己的网址,比如 www.jwjustwishes.com

1. 去域名注册商(如Namecheap、GoDaddy)买一个域名
2. 在Vercel项目的 **Settings → Domains** 输入您买的域名,照着Vercel给的指示,在域名注册商那边设置DNS纪录
3. 通常几分钟到几小时内会生效

---

## 关于安全性,几个重要提醒

- **千万不要把 `sk_live_` 或 `sk_test_` 金钥直接写进 `script.js` 或任何前端文件里** — 这个金钥只能放在Vercel的环境变量里,前端网页是任何人都能查看原始码的,一旦金钥外泄,别人就能用您的Stripe账户乱扣款。这也是为什么一定要透过 `api/create-checkout-session.js` 这个后端函数来处理,而不是直接在网页JS里调用Stripe。
- 目前 `create-checkout-session.js` 里,商品价格是直接信任浏览器传来的数字,正式上线前建议**改成后端自己查price而不是相信前端传来的价格**,避免有人恶意修改价格再送单(代码里已经用注解标注了这个位置,之后需要加强时告诉我,我可以帮您补上)。

## 第七步:设置折扣码系统(独一无二、只能用一次)

之前的折扣码是写死在 `script.js` 里的(比如 `WELCOME10`),这样任何人打开浏览器"检视原始码"都能看到全部折扣码,而且同一个码可以被无限次重复使用 — 这版已经改成**后端验证 + 数据库记录使用状态**,原理如下:

- 折扣码存在 **Vercel KV**(一个免费的小型数据库)里,记录"是否已经被用过"
- 客人在购物车输入折扣码,前端只是去问后端"这个码有效吗",后端才知道真正的折扣内容
- 客人按下Checkout的那一刻,后端会**立刻把这个码标记为已使用**,同一个码之后再输入,系统会回报"已使用过"

### 7.1 连接一个 Redis 数据库(透过 Upstash,在 Vercel Marketplace 里)

Vercel原本自己的"KV"数据库已经停用了,现在官方建议改用 **Upstash for Redis**(在Vercel Marketplace里,操作方式几乎一样):

1. 在 Vercel 项目页面,找到上方的 **Storage** 分页(或 **Marketplace**)
2. 搜寻 **Upstash for Redis**,点安装/建立一个新的Redis资源,取个名字(比如 `jw-discounts`)
3. 建立好后,把它 **Connect** 到您的 `jw-just-wishes-store` 项目
4. 连接后,Vercel会自动帮您的项目加上 `KV_REST_API_URL`、`KV_REST_API_TOKEN` 这两个环境变量(代码里已经写好读取这两个变量,不需要自己手动填)
5. 回到 Deployments,点 **Redeploy** 让设置生效

### 7.2 设一个管理密码(用来生成折扣码)

1. 在 Vercel 项目的 **Settings → Environment Variables**,新增一个变量:
   - Key: `ADMIN_SECRET`
   - Value: 自己设一串不容易被猜到的密码,比如 `jw-admin-2026-xyz`(不要用这个例子,自己换一个)
2. Redeploy 让设置生效

### 7.3 怎么生成一个"给某个人专属"的折扣码

折扣码不是您自己在网站上设定好、大家都能用的那种,而是**您主动生成一个、给特定一个人**,例如生日会某个小客人、抽奖得奖者。生成方式是用命令行呼叫这个网址(在电脑的Terminal/终端机执行,或用 Postman 这类工具):

```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您刚才设定的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"recipient":"Alicia (生日会嘉宾)"}'
```

会收到类似这样的回应:
```json
{ "code": "A1B2C3D4", "type": "percent", "value": 10, "label": "10% OFF", "used": false }
```

如果想自己指定一组好记的code(比如 `ALICIA10`),而不是系统随机生成的英数字组合,加一个 `"code"` 欄位就行:
```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您刚才设定的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"code":"ALICIA10","recipient":"Alicia"}'
```
如果这组code已经被用掉了(不管是之前生成过还是已经有人用过),系统会拒绝并提示您换一个,不会不小心覆盖掉别人的码。

### 一次生成多组码

**只要数量,不需要对应到谁** — 加 `"count"` 欄位(最多一次100组):
```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"count":20,"recipient":"Class party favours"}'
```
会回传一个 `codes` 阵列,里面20组各自独立的码。

**一人一组、还要知道哪组是给谁的** — 用 `"recipients"` 给一串名单(最多一次100人),系统会自动帮每个人生成一组专属码,并把名字记在对应的code上:
```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"recipients":["Alicia","Marcus","Zoe"]}'
```
回应会是:
```json
{ "codes": [
  { "code": "A1B2C3D4", "recipient": "Alicia", "label": "10% OFF", ... },
  { "code": "E5F6G7H8", "recipient": "Marcus", "label": "10% OFF", ... },
  { "code": "I9J0K1L2", "recipient": "Zoe", "label": "10% OFF", ... }
] }
```
这种方式很适合班级生日会这种场景 — 一次帮全班同学都生成好各自的码,再照名单一个个发出去,而且哪组码是给哪个小朋友的,您这边都有纪录可查。

### 自订"前缀+流水号"的码,比如 JW001、JW002、JW003...

不想用随机英数字组合,想要 `JW001`、`JW002` 这种一看就知道是您店里发的、还能排顺序的码,加一个 `"prefix"` 欄位就行:

```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"prefix":"JW","count":5}'
```
会依序生成 `JW001`、`JW002`、`JW003`、`JW004`、`JW005`。这个编号会**持续累加、记在数据库里**,不会因为您隔几天再生成新一批就从头算 — 比如今天生成到 `JW005`,下星期再用同样的 `prefix:"JW"` 生成,会接着从 `JW006` 开始,不会重复。

也可以跟 `recipients` 名单一起用,一人一组、还带编号:
```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"prefix":"JW","recipients":["Alicia","Marcus"]}'
```
会得到 `JW006`(给Alicia)、`JW007`(给Marcus)这样依序编号,且每笔都记得是给谁的。

默认编号是补0到3位数(`JW001`),如果订单量大想要4位数(`JW0001`),加一个 `"padding":4` 就行。不同的 `prefix` 各自独立计数,比如 `"JW"` 和 `"PARTY"` 两组前缀不会互相影响到对方的编号。

`prefix` 不能跟自订的 `code` 一起用(两个都是在指定code要长什么样,只能选一个)。

### 查看已经生成过的所有码、哪些用过了

用 `api/list-discounts.js` 这个端点,可以直接在浏览器网址列贴上去看(不需要用终端机):

```
https://您的网站网址/api/list-discounts?secret=您的ADMIN_SECRET
```

会看到类似这样的结果:
```json
{
  "summary": { "total": 12, "used": 4, "unused": 8 },
  "codes": [
    { "code": "JW005", "used": false, "recipient": "Zoe", "label": "10% OFF", ... },
    { "code": "JW004", "used": true,  "recipient": "Marcus", "label": "10% OFF", ... },
    ...
  ]
}
```
按生成时间由新到旧排列。

**只想看还没用过的**(还能用的码):
```
https://您的网站网址/api/list-discounts?secret=您的ADMIN_SECRET&used=false
```

**只想看已经用掉的**:
```
https://您的网站网址/api/list-discounts?secret=您的ADMIN_SECRET&used=true
```

**只想看某个前缀的**(比如所有JW开头的):
```
https://您的网站网址/api/list-discounts?secret=您的ADMIN_SECRET&prefix=JW
```

这几个筛选条件可以同时组合用(用 `&` 接起来)。因为密码是直接写在网址上,建议看完就把分页关掉,不要把这个网址存在书签或分享给别人。

### 7.3.1 一次生成多组(比如全班20个小朋友)

加一个 `"count"` 欄位,一次呼叫就能生成多组各自独立的码(每组都是不同的随机码,单独计算使用状态):

```bash
curl -X POST https://您的网站网址/api/generate-discount \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: 您刚才设定的ADMIN_SECRET" \
  -d '{"type":"percent","value":10,"count":20,"recipient":"班级生日会回礼"}'
```

会收到一个包含20组码的清单:
```json
{ "codes": [
  {"code":"A1B2C3D4", "label":"10% OFF", ...},
  {"code":"E5F6G7H8", "label":"10% OFF", ...},
  ... (共20组)
]}
```

每一组都是独立的,各自只能用一次 — 也就是20位小朋友的家长各自拿到不同的码,不会互相冲突。`count` 最多一次生成100组。注意 `count` 大于1时不能同时指定自订的 `code`(自订code一次只能生成一组)。

把这组 `code`(例如 `A1B2C3D4`)透过WhatsApp或私讯发给那位客人,他在购物车输入这组码,系统会显示"Applied: 10% OFF"。一旦他完成结账,这组码就会自动失效,不管是他自己还是任何人,再输入同一组码都只会看到"已使用过"。

`type` 可以是 `"percent"`(百分比折扣,`value` 填数字如 `10` 代表10%)或 `"fixed"`(固定金额折扣,`value` 填 `5` 代表折抵S$5)。

### 7.4 有个小提醒

现在的设计是:**客人点击Checkout、系统建立好Stripe付款连结的那一刻**,折扣码就被标记为用掉了 — 即使他最后没有完成付款。这个做法简单可靠,唯一的小缺点是:如果客人半路放弃付款,这组码就报废了,需要您重新生成一组新的给他。如果之后想改成"只有真的付款成功才算用掉",做法上需要多接一个Stripe的webhook,这个之后有需要再跟我说,我可以帮您加上。



- 想加/改/删商品
- 想把送货地址、物流费用也加进结账流程
- 想串接PayNow QR或其他新加坡本地支付方式(可以透过HitPay等服务商实现)
- 想做订单管理后台,方便您看到"谁买了什么、要刻什么名字"
