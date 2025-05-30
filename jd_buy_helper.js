/**
 * 脚本名称：京东购物助手
 * 使用说明：进入APP商品详情页触发，支持京东下单返利和慢慢买、购物党和什么值得买跳转比价领券以及慢慢买接口历史价格。

[Script] 
# > 京东购物助手
购物助手 = type=http-response,pattern=^https:\/\/in\.m\.jd\.com\/product\/.+?\.html,requires-body=1,max-size=-1,script-path=https://raw.githubusercontent.com/githubdulong/Script/master/jd_buy_helper.js
慢慢买CK = type=http-request,pattern=^https?:\/\/apapia-sqk-weblogic\.manmanbuy\.com/baoliao\/center\/menu,requires-body=1,max-size=0,binary-body-mode=0,script-path=https://raw.githubusercontent.com/githubdulong/Script/master/MmmCK.js
[MITM]
hostname = %APPEND% in.m.jd.com, lite-in.m.jd.com, apapia-sqk-weblogic.manmanbuy.com
 
 * 添加脚本后依赖BoxJs使用 https://raw.githubusercontent.com/FoKit/Scripts/main/boxjs/fokit.boxjs.json

 * Surge可填写模块参数使用 https://raw.githubusercontent.com/githubdulong/Script/master/Surge/jd_buy_helper.sgmodule

 */
 
const $ = new Env("购物助手");
intCryptoJS();
let html = $response.body;

(async () => {
  if (!html || !html.includes("</html>")) {
    $.log("找不到</html>标签，结束执行");
    $.done({ body: html });
    return;
  }
  $.log("已开始执行");

  // 初始化参数与环境变量
  await init_tools();

  if ($.jd_unionId && $.jtt_appid && $.jtt_appkey) {

    await jingfenJingTuiTui();
  } else {
    $.msg($.name, "", "请检查配置是否正确 ❌");
    $.done({ body: html });
    return;
  }

  await get_price_comparison();

  await notice();

  await hook_html();
})()
  .catch((e) => {
    $.log($.name, "", "出错了: " + e + "❌");
  })
  .finally(() => {
    $.done({ body: html });
  });

/** 初始化：读取模块参数和本地存储参数，设置全局变量 */
async function init_tools() {
  $.log("初始化开始");

  // 获取模块传入参数
  const args = typeof $argument !== "undefined" ? $argument : "";
  $.log(`传入的参数: ${args}`);
  const argObj = Object.fromEntries(
    args.split("&").map(item => item.split("=").map(decodeURIComponent))
  );
  const isEmpty = (val) => !val || val === "null";

  // 参数优先级：模块参数 > BoxJs 本地存储
  $.jd_unionId = !isEmpty(argObj["jd_union_id"])
    ? argObj["jd_union_id"]
    : $.getdata("jd_unionId") || "";
  $.jd_positionId = !isEmpty(argObj["jd_position_id"])
    ? argObj["jd_position_id"]
    : $.getdata("jd_positionId") || "";
  $.jtt_appid = !isEmpty(argObj["jtt_appid"])
    ? argObj["jtt_appid"]
    : $.getdata("jtt_appid") || "";
  $.jtt_appkey = !isEmpty(argObj["jtt_appkey"])
    ? argObj["jtt_appkey"]
    : $.getdata("jtt_appkey") || "";

  $.log(`jd_unionId: ${$.jd_unionId}`);
  $.log(`jd_positionId: ${$.jd_positionId}`);
  $.log(`jtt_appid: ${$.jtt_appid}`);
  $.log(`jtt_appkey: ${$.jtt_appkey}`);

  $.button = [];
  const helperConfig = {
    zdm: argObj["buy_helper_zdm"] || $.getdata("buy_helper_zdm") || "true",
    mmm: argObj["buy_helper_mmm"] || $.getdata("buy_helper_mmm") || "true",
    gwd: argObj["buy_helper_gwd"] || $.getdata("buy_helper_gwd") || "false",
    copy: argObj["buy_helper_copy"] || $.getdata("buy_helper_copy") || "true",
  };
  if (helperConfig.zdm !== "false") $.button.push("smzdm");
  if (helperConfig.mmm !== "false") $.button.push("mmm");
  if (helperConfig.gwd !== "false") $.button.push("gwd");
  if (helperConfig.copy !== "false") $.button.push("copy");

  $.buy_helper_LR = argObj["buy_helper_LR"] || $.getdata("buy_helper_LR") || "left";

  let url = $request.url;
  $.appType = url.includes("lite-in.m.jd.com") ? "jdtj" : "jd";
  $.sku = (url.match(/\/(\d+)\.html/) || [])[1] || "";
  $.shortUrl = `https://item.jd.com/${$.sku}.html`;

  $.log("初始化完成");
  $.log(`类型: ${$.appType}`);
  $.log(`商品: ${$.sku}`);
  $.log(`appId: ${$.jtt_appid}`);
  $.log(`appkey: ${$.jtt_appkey}`);
}

/** 京推推转链 */
async function jingfenJingTuiTui() {
  $.log("转链开始");
  return new Promise((resolve) => {
    const options = {
      url: `http://japi.jingtuitui.com/api/universal?appid=${$.jtt_appid}&appkey=${$.jtt_appkey}&v=v3&unionid=${$.jd_unionId}&positionid=${$.jd_positionId}&content=https://item.jd.com/${$.sku}.html`,
      timeout: 100 * 1000,
      headers: { "Content-Type": "application/json;charset=utf-8" },
    };
    $.get(options, (err, resp, data) => {
      try {
        if (err) {
          $.log("京推推 universal 请求失败：" + $.toStr(err));
        } else {
          data = JSON.parse(data);
          if (data["return"] == 0) {
            const linkData = data?.result?.link_date?.[0] || {};
            const { chain_link, goods_info } = linkData;
            if (goods_info) {
              const { skuName = chain_link, imageInfo, commissionInfo, priceInfo } = goods_info;
              $.commissionShare = commissionInfo.commissionShare;
              $.commission = commissionInfo.couponCommission;
              $.price = priceInfo.lowestPrice;
              $.skuName = skuName;
              $.skuImg = imageInfo.imageList?.[0]?.url;
            }
            $.shortUrl = chain_link;
            $.log("转链完成，短链地址：" + $.shortUrl);
          } else {
            $.log("转链返回异常：" + $.toStr(data));
          }
        }
      } catch (e) {
        $.logErr(e, resp);
      } finally {
        resolve();
      }
    });
  });
}

/** 获取慢慢买 CK 的封装 */
const getmmCK = () => {
  const ck = $.getdata("慢慢买CK");
  if (!ck) {
    $.msg("未获取ck", "请先打开【慢慢买】APP--我的, 获取ck", "");
  }
  return ck;
};

const $http = (op, t = 4) => {
  const { promise, resolve, reject } = Promise.withResolvers();
  const HTTPError = (e, req, res) =>
    Object.assign(new Error(e), {
      name: "HTTPError",
      request: req,
      response: res,
    });

  const handleRes = ({ bodyBytes, ...res }) => {
    res.status ??= res.statusCode;
    res.json = () => JSON.parse(res.body);
    if (res.headers?.["binary-mode"] && bodyBytes)
      res.body = new Uint8Array(bodyBytes);

    res.error || res.status < 200 || res.status > 307
      ? reject(HTTPError(res.error, op, res))
      : resolve(res);
  };

  const timer = setTimeout(
    () => reject(HTTPError("timeout", op)),
    op.$timeout ?? t * 1000
  );
  this.$httpClient?.[op.method || "get"](op, (error, resp, body) => {
    handleRes({ error, ...resp, body });
  });
  this.$task?.fetch({ url: op, ...op }).then(handleRes, handleRes);

  return promise.finally(() => clearTimeout(timer));
};

const getMMdata = (id) => {
  const buildMultipart = (fields) => {
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(36).substr(2);
    let body = "";

    for (const [name, value] of Object.entries(fields)) {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      body += `${value}\r\n`;
    }
    body += `--${boundary}--\r\n`;

    return { body, boundary };
  };

  const shareBody = {
    methodName: "trendJava",
    spbh: `1|${id}`,
    url: `https://item.jd.com/${id}.html`,
    t: Date.now().toString(),
    c_appver: "4.8.3.1",
    c_mmbDevId: getmmCK(),
  };

  shareBody.token = md5(
    encodeURIComponent(
      "3E41D1331F5DDAFCD0A38FE2D52FF66F" +
        jsonToCustomString(shareBody) +
        "3E41D1331F5DDAFCD0A38FE2D52FF66F"
    )
  ).toUpperCase();

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 13_1_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 - mmbWebBrowse - ios",
  };

  const reqShare = {
    method: "post",
    url: "https://apapia-history-weblogic.manmanbuy.com/app/share",
    headers,
    body: jsonToQueryString(shareBody),
  };

  return $http(reqShare)
    .then((res) => {
      const { msg, code, data } = res.json();
      if (code !== 2000) throw new Error(msg);
      if (!data) throw new Error(`${reqShare.url}: 无效数据`);

      return new URL(data).searchParams;
    })
    .then((params) => {
      const fields = {
        shareId: params.get("shareId"),
        sign: params.get("sign"),
        spbh: params.get("spbh"),
        url: params.get("url"),
      };

      const { body, boundary } = buildMultipart(fields);

      const reqTrendData = {
        method: "post",
        url: "https://apapia-history-weblogic.manmanbuy.com/h5/share/trendData",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      };

      return $http(reqTrendData);
    })
    .then((res) => res.json());
};

/** 获取比价信息 */
async function get_price_comparison() {
    try {
        const data = await getMMdata($.sku);
        if (data?.ok && data?.result?.priceRemark?.ListPriceDetail) {
          const lowerItem = data?.result?.priceRemark?.ListPriceDetail.find(item => item.ShowName === "历史最低");
          if (lowerItem) {
            const { extraPrice, Price, Difference, Date } = lowerItem;
            $.Difference = Difference;
            $.desc = `历史最低: ${Price || `¥${extraPrice}`} (${Date})`;
          } else {
            $.desc = "历史最低: 暂无";
          }
          $.price = data?.recentlyZK?.currentprice || $.price;
          $.skuName = data?.single?.title || $.skuName;
          $.skuImg = data?.single?.smallpic || $.skuImg;
        } else {
          $.desc = "历史最低: 暂无";
          $.log("获取比价信息失败");
        }
      } catch (e) {
        $.logErr(e);
      }
}

/** 发送通知 */
async function notice() {
  $.log("发送通知");
  $.title = $.skuName || "商品信息";
  $.opts = { "auto-dismiss": 30 };

  $.desc = $.desc || "";
  if (/u\.jd\.com/.test($.shortUrl)) {
    $.desc += `\n预计返利: ¥${(($.price * $.commissionShare) / 100).toFixed(2)}  ${$.commissionShare}%`;
    $.desc += `\n当前到手: ¥${$.price}${$.Difference ? "  " + $.Difference : ""}`;

    // 根据平台生成跳转链接
    if ($.appType === "jdtj") {
      $.jumpUrl = `openjdlite://virtual?params=${encodeURIComponent(
        '{"category":"jump","des":"m","url":"' + $.shortUrl + '"}'
      )}`;
    } else {
      $.jumpUrl = `openApp.jdMobile://virtual?params=${encodeURIComponent(
        '{"category":"jump","des":"m","sourceValue":"babel-act","sourceType":"babel","url":"' + $.shortUrl + '"}'
      )}`;
    }
    $.opts["$open"] = $.jumpUrl;
  } else {
    $.desc += "\n预计返利: 暂无";
    $.log("无佣金商品");
  }
  if ($.skuImg) $.opts["$media"] = $.skuImg;
  if ($.isLoon() && $loon.split(" ")[1].split(".")[0] === "16") {
    $.opts["$media"] = undefined;
  }
  $.msg($.title, $.subt, $.desc, $.opts);
}

/** 注入 HTML */
async function hook_html() {
  $.log("开始注入html");
  const buttons = [
    { key: "mmm", icon: "https://raw.githubusercontent.com/FoKit/Scripts/main/images/icon/mmm.png" },
    { key: "smzdm", icon: "https://raw.githubusercontent.com/FoKit/Scripts/main/images/icon/zdm.png" },
    { key: "gwd", icon: "https://raw.githubusercontent.com/FoKit/Scripts/main/images/icon/gwd.png" },
    { key: "jf", icon: "https://raw.githubusercontent.com/FoKit/Scripts/main/images/icon/jf.png" },
    { key: "copy", icon: "https://raw.githubusercontent.com/FoKit/Scripts/main/images/icon/copy.png" }
  ].filter(item => $.button.includes(item.key) && $.sku);


  const hookContent = `
  <style>
    html, body { -webkit-user-select: auto !important; user-select: auto !important; }
    #tools { position: fixed; z-index: 99999; border: none; top: 40%; }
    #tools.right { right: 0; }
    #tools.left { left: 0; }
    #tools button { background-color: #fff; padding: 3px 8px; display: block; margin-bottom: 5px; box-shadow: -2px 1px 8px #888888; border: 1px; }
    #tools img { width: 25px; height: 25px; border-radius: 50%; overflow: hidden; position: relative; }
    #tools.right button { border-radius: 50px 0 0 50px; }
    #tools.right button img { left: -5px; }
    #tools.left button { border-radius: 0 50px 50px 0; }
    #tools.left button img { right: -5px; }
    /* 半透明黑色背景 */
    .overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 999; display: none; }
    /* 圆角提示框 */
    .custom-alert { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: white; border-radius: 10px; padding: 20px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.3); z-index: 1000; display: none; }
  </style>
  <div id="tools" class="${$.buy_helper_LR}">
    ${buttons.map(item => `<button id="${item.key}"><img src="${item.icon}" /></button>`).join("\n")}
  </div>
  <script>
    // 通用复制并跳转函数（复制成功后跳转对应 APP）
    function copyAndJump(link, scheme) {
      navigator.clipboard.writeText(link).then(() => {
        console.log("复制成功: " + link);
        window.location.href = scheme;
      }).catch((err) => {
        console.error("复制失败: ", err);
      });
    }
    // 按钮事件：均使用转链后的 $.shortUrl
    const zdmbtn = document.getElementById("smzdm");
    zdmbtn && zdmbtn.addEventListener("click", () => {
      copyAndJump("${$.shortUrl}", "smzdm://");
    });
    const mmmbtn = document.getElementById("mmm");
    mmmbtn && mmmbtn.addEventListener("click", () => {
      copyAndJump("${$.shortUrl}", "manmanbuy://");
    });
    const gwdbtn = document.getElementById("gwd");
    gwdbtn && gwdbtn.addEventListener("click", () => {
      copyAndJump("${$.shortUrl}", "gwdang://");
    });
    // 复制短链按钮，弹出提示显示转链后的链接
    const cpbtn = document.getElementById("copy");
    cpbtn && cpbtn.addEventListener("click", () => {
      navigator.clipboard.writeText("${$.shortUrl}").then(() => {
        window.alert("${$.shortUrl}");
        console.log("复制成功: ${$.shortUrl}");
      }).catch((err) => {
        console.error("复制失败: ", err);
      });
    });
  </script>
  </html>`;
  
  html = html.replace(/<\/html>/, hookContent);
  $.log("注入html完成");
  $.done({ body: html });
}


function jsonToQueryString(jsonObject) {return Object.keys(jsonObject).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(jsonObject[key])}`).join('&');}


function jsonToCustomString(jsonObject){return Object.keys(jsonObject).filter(key=>jsonObject[key]!==''&&key.toLowerCase()!=='token').sort().map(key=>`${key.toUpperCase()}${jsonObject[key].toUpperCase()}`).join('');}


function intCryptoJS(){CryptoJS=function(t,r){var n;if("undefined"!=typeof window&&window.crypto&&(n=window.crypto),"undefined"!=typeof self&&self.crypto&&(n=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(n=globalThis.crypto),!n&&"undefined"!=typeof window&&window.msCrypto&&(n=window.msCrypto),!n&&"undefined"!=typeof global&&global.crypto&&(n=global.crypto),!n&&"function"==typeof require)try{n=require("crypto")}catch(t){}var e=function(){if(n){if("function"==typeof n.getRandomValues)try{return n.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof n.randomBytes)try{return n.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},i=Object.create||function(){function t(){}return function(r){var n;return t.prototype=r,n=new t,t.prototype=null,n}}(),o={},a=o.lib={},s=a.Base={extend:function(t){var r=i(this);return t&&r.mixIn(t),r.hasOwnProperty("init")&&this.init!==r.init||(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var t=this.extend();return t.init.apply(t,arguments),t},init:function(){},mixIn:function(t){for(var r in t)t.hasOwnProperty(r)&&(this[r]=t[r]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},c=a.WordArray=s.extend({init:function(t,r){t=this.words=t||[],this.sigBytes=null!=r?r:4*t.length},toString:function(t){return(t||f).stringify(this)},concat:function(t){var r=this.words,n=t.words,e=this.sigBytes,i=t.sigBytes;if(this.clamp(),e%4)for(var o=0;o<i;o++){var a=n[o>>>2]>>>24-o%4*8&255;r[e+o>>>2]|=a<<24-(e+o)%4*8}else for(var s=0;s<i;s+=4)r[e+s>>>2]=n[s>>>2];return this.sigBytes+=i,this},clamp:function(){var r=this.words,n=this.sigBytes;r[n>>>2]&=4294967295<<32-n%4*8,r.length=t.ceil(n/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(r){var n,i=[],o=function(r){r=r;var n=987654321,e=4294967295;return function(){var i=((n=36969*(65535&n)+(n>>16)&e)<<16)+(r=18e3*(65535&r)+(r>>16)&e)&e;return i/=4294967296,(i+=.5)*(t.random()>.5?1:-1)}},a=!1;try{e(),a=!0}catch(t){}for(var s,u=0;u<r;u+=4)a?i.push(e()):(s=987654071*(n=o(4294967296*(s||t.random())))(),i.push(4294967296*n()|0));return new c.init(i,r)}}),u=o.enc={},f=u.Hex={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push((o>>>4).toString(16)),e.push((15&o).toString(16))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e+=2)n[e>>>3]|=parseInt(t.substr(e,2),16)<<24-e%8*4;return new c.init(n,r/2)}},h=u.Latin1={stringify:function(t){for(var r=t.words,n=t.sigBytes,e=[],i=0;i<n;i++){var o=r[i>>>2]>>>24-i%4*8&255;e.push(String.fromCharCode(o))}return e.join("")},parse:function(t){for(var r=t.length,n=[],e=0;e<r;e++)n[e>>>2]|=(255&t.charCodeAt(e))<<24-e%4*8;return new c.init(n,r)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(h.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return h.parse(unescape(encodeURIComponent(t)))}},d=a.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new c.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(r){var n,e=this._data,i=e.words,o=e.sigBytes,a=this.blockSize,s=o/(4*a),u=(s=r?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*a,f=t.min(4*u,o);if(u){for(var h=0;h<u;h+=a)this._doProcessBlock(i,h);n=i.splice(0,u),e.sigBytes-=f}return new c.init(n,f)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(a.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(r,n){return new t.init(n).finalize(r)}},_createHmacHelper:function(t){return function(r,n){return new l.HMAC.init(t,n).finalize(r)}}}),o.algo={});return o}(Math);!function(t){var r=CryptoJS,n=r.lib,e=n.WordArray,i=n.Hasher,o=r.algo,a=[];!function(){for(var r=0;r<64;r++)a[r]=4294967296*t.abs(t.sin(r+1))|0}();var s=o.MD5=i.extend({_doReset:function(){this._hash=new e.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(t,r){for(var n=0;n<16;n++){var e=r+n,i=t[e];t[e]=16711935&(i<<8|i>>>24)|4278255360&(i<<24|i>>>8)}var o=this._hash.words,s=t[r+0],p=t[r+1],d=t[r+2],l=t[r+3],y=t[r+4],v=t[r+5],g=t[r+6],w=t[r+7],_=t[r+8],m=t[r+9],B=t[r+10],b=t[r+11],C=t[r+12],S=t[r+13],x=t[r+14],A=t[r+15],H=o[0],z=o[1],M=o[2],D=o[3];z=h(z=h(z=h(z=h(z=f(z=f(z=f(z=f(z=u(z=u(z=u(z=u(z=c(z=c(z=c(z=c(z,M=c(M,D=c(D,H=c(H,z,M,D,s,7,a[0]),z,M,p,12,a[1]),H,z,d,17,a[2]),D,H,l,22,a[3]),M=c(M,D=c(D,H=c(H,z,M,D,y,7,a[4]),z,M,v,12,a[5]),H,z,g,17,a[6]),D,H,w,22,a[7]),M=c(M,D=c(D,H=c(H,z,M,D,_,7,a[8]),z,M,m,12,a[9]),H,z,B,17,a[10]),D,H,b,22,a[11]),M=c(M,D=c(D,H=c(H,z,M,D,C,7,a[12]),z,M,S,12,a[13]),H,z,x,17,a[14]),D,H,A,22,a[15]),M=u(M,D=u(D,H=u(H,z,M,D,p,5,a[16]),z,M,g,9,a[17]),H,z,b,14,a[18]),D,H,s,20,a[19]),M=u(M,D=u(D,H=u(H,z,M,D,v,5,a[20]),z,M,B,9,a[21]),H,z,A,14,a[22]),D,H,y,20,a[23]),M=u(M,D=u(D,H=u(H,z,M,D,m,5,a[24]),z,M,x,9,a[25]),H,z,l,14,a[26]),D,H,_,20,a[27]),M=u(M,D=u(D,H=u(H,z,M,D,S,5,a[28]),z,M,d,9,a[29]),H,z,w,14,a[30]),D,H,C,20,a[31]),M=f(M,D=f(D,H=f(H,z,M,D,v,4,a[32]),z,M,_,11,a[33]),H,z,b,16,a[34]),D,H,x,23,a[35]),M=f(M,D=f(D,H=f(H,z,M,D,p,4,a[36]),z,M,y,11,a[37]),H,z,w,16,a[38]),D,H,B,23,a[39]),M=f(M,D=f(D,H=f(H,z,M,D,S,4,a[40]),z,M,s,11,a[41]),H,z,l,16,a[42]),D,H,g,23,a[43]),M=f(M,D=f(D,H=f(H,z,M,D,m,4,a[44]),z,M,C,11,a[45]),H,z,A,16,a[46]),D,H,d,23,a[47]),M=h(M,D=h(D,H=h(H,z,M,D,s,6,a[48]),z,M,w,10,a[49]),H,z,x,15,a[50]),D,H,v,21,a[51]),M=h(M,D=h(D,H=h(H,z,M,D,C,6,a[52]),z,M,l,10,a[53]),H,z,B,15,a[54]),D,H,p,21,a[55]),M=h(M,D=h(D,H=h(H,z,M,D,_,6,a[56]),z,M,A,10,a[57]),H,z,g,15,a[58]),D,H,S,21,a[59]),M=h(M,D=h(D,H=h(H,z,M,D,y,6,a[60]),z,M,b,10,a[61]),H,z,d,15,a[62]),D,H,m,21,a[63]),o[0]=o[0]+H|0,o[1]=o[1]+z|0,o[2]=o[2]+M|0,o[3]=o[3]+D|0},_doFinalize:function(){var r=this._data,n=r.words,e=8*this._nDataBytes,i=8*r.sigBytes;n[i>>>5]|=128<<24-i%32;var o=t.floor(e/4294967296),a=e;n[15+(i+64>>>9<<4)]=16711935&(o<<8|o>>>24)|4278255360&(o<<24|o>>>8),n[14+(i+64>>>9<<4)]=16711935&(a<<8|a>>>24)|4278255360&(a<<24|a>>>8),r.sigBytes=4*(n.length+1),this._process();for(var s=this._hash,c=s.words,u=0;u<4;u++){var f=c[u];c[u]=16711935&(f<<8|f>>>24)|4278255360&(f<<24|f>>>8)}return s},clone:function(){var t=i.clone.call(this);return t._hash=this._hash.clone(),t}});function c(t,r,n,e,i,o,a){var s=t+(r&n|~r&e)+i+a;return(s<<o|s>>>32-o)+r}function u(t,r,n,e,i,o,a){var s=t+(r&e|n&~e)+i+a;return(s<<o|s>>>32-o)+r}function f(t,r,n,e,i,o,a){var s=t+(r^n^e)+i+a;return(s<<o|s>>>32-o)+r}function h(t,r,n,e,i,o,a){var s=t+(n^(r|~e))+i+a;return(s<<o|s>>>32-o)+r}r.MD5=i._createHelper(s),r.HmacMD5=i._createHmacHelper(s)}(Math),function(){var t=CryptoJS,r=t.lib.WordArray;t.enc.Base64={stringify:function(t){var r=t.words,n=t.sigBytes,e=this._map;t.clamp();for(var i=[],o=0;o<n;o+=3)for(var a=(r[o>>>2]>>>24-o%4*8&255)<<16|(r[o+1>>>2]>>>24-(o+1)%4*8&255)<<8|r[o+2>>>2]>>>24-(o+2)%4*8&255,s=0;s<4&&o+.75*s<n;s++)i.push(e.charAt(a>>>6*(3-s)&63));var c=e.charAt(64);if(c)for(;i.length%4;)i.push(c);return i.join("")},parse:function(t){var n=t.length,e=this._map,i=this._reverseMap;if(!i){i=this._reverseMap=[];for(var o=0;o<e.length;o++)i[e.charCodeAt(o)]=o}var a=e.charAt(64);if(a){var s=t.indexOf(a);-1!==s&&(n=s)}return function(t,n,e){for(var i=[],o=0,a=0;a<n;a++)if(a%4){var s=e[t.charCodeAt(a-1)]<<a%4*2,c=e[t.charCodeAt(a)]>>>6-a%4*2;i[o>>>2]|=(s|c)<<24-o%4*8,o++}return r.create(i,o)}(t,n,i)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="}}();};
function md5(word){return CryptoJS.MD5(word).toString();}


// prettier-ignore
function Env(t, e) { class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise(((e, i) => { s.call(this, t, ((t, s, o) => { t ? i(t) : e(s) })) })) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.logLevels = { debug: 0, info: 1, warn: 2, error: 3 }, this.logLevelPrefixs = { debug: "[DEBUG] ", info: "[INFO] ", warn: "[WARN] ", error: "[ERROR] " }, this.logLevel = "info", this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.encoding = "utf-8", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } getEnv() { return "undefined" != typeof $environment && $environment["surge-version"] ? "Surge" : "undefined" != typeof $environment && $environment["stash-version"] ? "Stash" : "undefined" != typeof module && module.exports ? "Node.js" : "undefined" != typeof $task ? "Quantumult X" : "undefined" != typeof $loon ? "Loon" : "undefined" != typeof $rocket ? "Shadowrocket" : void 0 } isNode() { return "Node.js" === this.getEnv() } isQuanX() { return "Quantumult X" === this.getEnv() } isSurge() { return "Surge" === this.getEnv() } isLoon() { return "Loon" === this.getEnv() } isShadowrocket() { return "Shadowrocket" === this.getEnv() } isStash() { return "Stash" === this.getEnv() } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null, ...s) { try { return JSON.stringify(t, ...s) } catch { return e } } getjson(t, e) { let s = e; if (this.getdata(t)) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise((e => { this.get({ url: t }, ((t, s, i) => e(i))) })) } runScript(t, e) { return new Promise((s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let o = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); o = o ? 1 * o : 20, o = e && e.timeout ? e.timeout : o; const [r, a] = i.split("@"), n = { url: `http://${a}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: o }, headers: { "X-Key": r, Accept: "*/*" }, timeout: o }; this.post(n, ((t, e, i) => s(i))) })).catch((t => this.logErr(t))) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), o = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, o) : i ? this.fs.writeFileSync(e, o) : this.fs.writeFileSync(t, o) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let o = t; for (const t of i) if (o = Object(o)[t], void 0 === o) return s; return o } lodash_set(t, e, s) { return Object(t) !== t || (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce(((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}), t)[e[e.length - 1]] = s), t } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), o = s ? this.getval(s) : ""; if (o) try { const t = JSON.parse(o); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, o] = /^@(.*?)\.(.*?)$/.exec(e), r = this.getval(i), a = i ? "null" === r ? null : r || "{}" : "{}"; try { const e = JSON.parse(a); this.lodash_set(e, o, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const r = {}; this.lodash_set(r, o, t), s = this.setval(JSON.stringify(r), i) } } else s = this.setval(t, e); return s } getval(t) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.read(t); case "Quantumult X": return $prefs.valueForKey(t); case "Node.js": return this.data = this.loaddata(), this.data[t]; default: return this.data && this.data[t] || null } } setval(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": return $persistentStore.write(t, e); case "Quantumult X": return $prefs.setValueForKey(t, e); case "Node.js": return this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0; default: return this.data && this.data[e] || null } } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.cookie && void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))) } get(t, e = (() => { })) { switch (t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"], delete t.headers["content-type"], delete t.headers["content-length"]), t.params && (t.url += "?" + this.queryStr(t.params)), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let s = require("iconv-lite"); this.initGotEnv(t), this.got(t).on("redirect", ((t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } })).then((t => { const { statusCode: i, statusCode: o, headers: r, rawBody: a } = t, n = s.decode(a, this.encoding); e(null, { status: i, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: i, response: o } = t; e(i, o, o && s.decode(o.rawBody, this.encoding)) })); break } } post(t, e = (() => { })) { const s = t.method ? t.method.toLocaleLowerCase() : "post"; switch (t.body && t.headers && !t.headers["Content-Type"] && !t.headers["content-type"] && (t.headers["content-type"] = "application/x-www-form-urlencoded"), t.headers && (delete t.headers["Content-Length"], delete t.headers["content-length"]), void 0 === t.followRedirect || t.followRedirect || ((this.isSurge() || this.isLoon()) && (t["auto-redirect"] = !1), this.isQuanX() && (t.opts ? t.opts.redirection = !1 : t.opts = { redirection: !1 })), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient[s](t, ((t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status ? s.status : s.statusCode, s.status = s.statusCode), e(t, s, i) })); break; case "Quantumult X": t.method = s, this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then((t => { const { statusCode: s, statusCode: i, headers: o, body: r, bodyBytes: a } = t; e(null, { status: s, statusCode: i, headers: o, body: r, bodyBytes: a }, r, a) }), (t => e(t && t.error || "UndefinedError"))); break; case "Node.js": let i = require("iconv-lite"); this.initGotEnv(t); const { url: o, ...r } = t; this.got[s](o, r).then((t => { const { statusCode: s, statusCode: o, headers: r, rawBody: a } = t, n = i.decode(a, this.encoding); e(null, { status: s, statusCode: o, headers: r, rawBody: a, body: n }, n) }), (t => { const { message: s, response: o } = t; e(s, o, o && i.decode(o.rawBody, this.encoding)) })); break } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } queryStr(t) { let e = ""; for (const s in t) { let i = t[s]; null != i && "" !== i && ("object" == typeof i && (i = JSON.stringify(i)), e += `${s}=${i}&`) } return e = e.substring(0, e.length - 1), e } msg(e = t, s = "", i = "", o) { const r = t => { const { $open: e, $copy: s, $media: i, $mediaMime: o } = t; switch (typeof t) { case void 0: return t; case "string": switch (this.getEnv()) { case "Surge": case "Stash": default: return { url: t }; case "Loon": case "Shadowrocket": return t; case "Quantumult X": return { "open-url": t }; case "Node.js": return }case "object": switch (this.getEnv()) { case "Surge": case "Stash": case "Shadowrocket": default: { const r = {}; let a = t.openUrl || t.url || t["open-url"] || e; a && Object.assign(r, { action: "open-url", url: a }); let n = t["update-pasteboard"] || t.updatePasteboard || s; if (n && Object.assign(r, { action: "clipboard", text: n }), i) { let t, e, s; if (i.startsWith("http")) t = i; else if (i.startsWith("data:")) { const [t] = i.split(";"), [, o] = i.split(","); e = o, s = t.replace("data:", "") } else { e = i, s = (t => { const e = { JVBERi0: "application/pdf", R0lGODdh: "image/gif", R0lGODlh: "image/gif", iVBORw0KGgo: "image/png", "/9j/": "image/jpg" }; for (var s in e) if (0 === t.indexOf(s)) return e[s]; return null })(i) } Object.assign(r, { "media-url": t, "media-base64": e, "media-base64-mime": o ?? s }) } return Object.assign(r, { "auto-dismiss": t["auto-dismiss"], sound: t.sound }), r } case "Loon": { const s = {}; let i = t.openUrl || t.url || t["open-url"] || e; i && Object.assign(s, { openUrl: i }); let o = t.mediaUrl || t["media-url"]; return o && Object.assign(s, { mediaUrl: o }), s } case "Quantumult X": { const i = {}; let o = t["open-url"] || t.url || t.openUrl || e; o && Object.assign(i, { "open-url": o }); let r = t["media-url"] || t.mediaUrl; r && Object.assign(i, { "media-url": r }); let a = t["update-pasteboard"] || t.updatePasteboard || s; return a && Object.assign(i, { "update-pasteboard": a }), i } case "Node.js": return }default: return } }; if (!this.isMute) switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": default: $notification.post(e, s, i, r(o)); break; case "Quantumult X": $notify(e, s, i, r(o)); break; case "Node.js": break }if (!this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } debug(...t) { this.logLevels[this.logLevel] <= this.logLevels.debug && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.debug}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } info(...t) { this.logLevels[this.logLevel] <= this.logLevels.info && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.info}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } warn(...t) { this.logLevels[this.logLevel] <= this.logLevels.warn && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.warn}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } error(...t) { this.logLevels[this.logLevel] <= this.logLevels.error && (t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(`${this.logLevelPrefixs.error}${t.map((t => t ?? String(t))).join(this.logSeparator)}`)) } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.map((t => t ?? String(t))).join(this.logSeparator)) } logErr(t, e) { switch (this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: this.log("", `❗️${this.name}, 错误!`, e, t); break; case "Node.js": this.log("", `❗️${this.name}, 错误!`, e, void 0 !== t.message ? t.message : t, t.stack); break } } wait(t) { return new Promise((e => setTimeout(e, t))) } done(t = {}) { const e = ((new Date).getTime() - this.startTime) / 1e3; switch (this.log("", `🔔${this.name}, 结束! 🕛 ${e} 秒`), this.log(), this.getEnv()) { case "Surge": case "Loon": case "Stash": case "Shadowrocket": case "Quantumult X": default: $done(t); break; case "Node.js": process.exit(1) } } }(t, e) }
