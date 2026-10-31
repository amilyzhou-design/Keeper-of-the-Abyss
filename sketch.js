/* ============================================
   深渊牧光者 · 开屏 → 开场点亮仪式 → 阶段一 · 苏醒 → 阶段二 · 放牧
   场景机：title → diving → ritual → igniting → ignited → awaken(beat 1-3) → herd(选道 → 双缝探索与掠影 → 完成)

   · title    标题页：深海粒子背景 + 鼠标牵引
   · diving   点击 DIVE IN：标题上飘淡出，粒子上浮（下潜感），
              画面沉入阶段一底色 #03080F，火种淡入；同时申请摄像头、
              加载 MediaPipe 手势模型（转场的 3.4s 正好完成初始化）
   · ritual   中央悬浮"将熄未熄"的初光火种，捏合（拇指+食指）点亮
   · igniting 点亮演出：冲顶增亮 + 冲击环 + 暖闪 + 火星迸发
   · ignited  火种稳定燃烧；点亮后缓缓缩小成一小团常明灯火
   · awaken   阶段一 · 苏醒（萤火级微光：光灵与光尘同量级、数量少、运动慢）
              火种即掌心光晕：手入镜时贴手跟随，检测不到手时回归屏幕中心
              beat 1 第一只光灵：试探游来 → 环游两圈 → 安心停留，环游后半段即可唤醒同伴
              beat 2 星散苏醒：张手唤醒沉睡光点（由粒子海转化），握拳退散
              beat 3 首次共鸣：20 只共鸣闪光 + 群体环流一圈 → 无缝滑入阶段二
   · herd     阶段二 · 放牧：4800×3200 世界地图，宽、窄两条曲折长通道。
              入场选择航道；掌心左右控制前进/停留，上下自由探索水道。
              光灵各自游动并受火种牵引，捏合时才收拢；两水道内部随机采尘。
              黑影在双缝途中掠过：捏合防护、张手散开、蓄力后释放诱饵。
              横竖屏共享纹理、世界位置和进度；碰撞取自主礁石 WebP 的透明度。

   交付结构（课程三文件约束）：index.html / style.css / sketch.js
   + gesture_recognizer.task（现有手势模型数据文件，非代码）。
   阶段二与阶段三 WebP 保存在同级 assets/images/ 文件夹，路线数据内嵌在 sketch.js。
   MediaPipe 运行时为 CDN 库引用（方案 7.2：库引用不占文件数）。

   【临时调试钩子】ritual 场景下点击画面 = 模拟捏合点亮；
   按 R = 重置回标题页；window.__abyss = 自动化测试注入接口。
   ============================================ */

(function () {
  "use strict";

  var canvas = document.getElementById("sea");
  var ctx0 = canvas.getContext("2d");              // 主画布：环境层（每帧清屏，锐利无残影）
  var ctx = ctx0;                                  // 当前绘制目标（发光体绘制期间切到拖尾层）
  var trailCv = document.createElement("canvas");  // 拖尾光带离屏层：黑底累积发光轨迹
  var tctx = trailCv.getContext("2d");             // 每帧 'lighter' 合成回主画布（方案 5.7）

  /* ---------- 调色板（方案 5.6 · 阶段一 → 阶段二渐变） ---------- */
  var COLOR = {
    abyss: "#03080F",      // 背景：近黑蓝
    emberCore: "#FFF8E7",  // 火种亮芯
    emberWarm: "#FFF3D6",  // 火种暖光（光尘色）
    emberGold: "#F2C14E"   // 点亮瞬间的暖金
  };
  // 阶段二 · 放牧（方案 5.6 表）：底 #06121F，生物青蓝 #4FC3F7，阴影 #02060C
  var COLOR_P2 = { bg: [6, 18, 31], spirit: [79, 195, 247], shadow: [2, 6, 12] };

  // 颜色工具：hex → [r,g,b]，两色插值，rgba 字符串
  function hexRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  function rgbaStr(c, a) {
    return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a.toFixed(3) + ")";
  }
  function bgColor() {          // 当前深渊底色（随阶段过渡渐变）
    var base = mixRgb(hexRgb(COLOR.abyss), COLOR_P2.bg, morphT);
    if(scene===SCENE.ASCEND)return mixRgb([8,24,38],[26,74,107],easeInOutCubic(P4.blend));
    return scene === SCENE.BLOOM ? mixRgb(base, [8,24,38], bloomMix) : base;
  }

  /* ---------- 场景状态机 ---------- */
  var SCENE = { TITLE: 0, DIVING: 1, RITUAL: 2, IGNITING: 3, IGNITED: 4, AWAKEN: 5, HERD: 6, BLOOM: 7, ASCEND:8 };
  var Journey={startedAt:0,woken:0,completedAt:0};
  var scene = SCENE.TITLE;
  var sceneClock = 0;                 // 当前场景已进行的秒数
  var TIME_SCALE = 1;                 // 调试倍速（__abyss.setTimeScale）
  var morphT = 0;                     // 阶段一 → 阶段二渐变参数 0→1（底色/体色/形态/队形）

  var DIVE_DURATION = 3.4;            // 下潜过渡总时长（秒）
  var EMBER_FADEIN_AT = 2.1;          // 火种开始淡入的时刻
  var IGNITE_DURATION = 1.5;          // 点亮演出时长
  var BEAT1_DELAY = 0.5;              // 点亮稍歇，第一只光灵登场

  var W = 0, H = 0, dpr = 1;
  var particles = [];
  var trailMode = false;              // 拖尾模式（进入阶段一后开启，方案 5.7）

  // 下潜转场参数（由 updateDiving 驱动）
  var riseBias = 0;                   // 粒子上浮速度（像素/秒），模拟下潜相对运动
  var overlayA = 0;                   // 深渊色覆盖层透明度

  // 鼠标位置（EMA 平滑后的牵引中心，仅标题页使用）
  var mouse = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  var GATHER_RADIUS = 200;
  var GATHER_PULL = 26;

  /* ---------- 工具函数 ---------- */
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInCubic(t) { return t * t * t; }
  function normAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  /* ---------- 粒子定义（标题页深海微光，沿用原版） ---------- */
  function createParticle() {
    var isBlue = Math.random() < 0.15;
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      radius: isBlue ? rand(1.3, 2.6) : rand(0.5, 1.4),
      isBlue: isBlue,
      baseAlpha: isBlue ? rand(0.65, 1.0) : rand(0.4, 0.95),
      period: rand(3000, 6000),
      phase: Math.random() * Math.PI * 2,
      vx: rand(-5.5, 5.5),
      vy: rand(-4, 4),
      driftPhase: Math.random() * Math.PI * 2,
      driftPeriod: rand(6000, 12000)
    };
  }

  function resize() {
    if (scene === SCENE.HERD || scene === SCENE.BLOOM || scene===SCENE.ASCEND) { resizePhase2(); return; }
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx0.setTransform(dpr, 0, 0, dpr, 0, 0);
    trailCv.width = canvas.width;
    trailCv.height = canvas.height;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var target = Math.round((W * H) / 12000);
    target = Math.max(60, Math.min(220, target));
    while (particles.length < target) particles.push(createParticle());
    particles.length = target;
  }


  function resizePhase2() {
    var oldW = W, oldH = H, savedTrail = null;
    if (oldW && oldH && trailMode) {
      savedTrail = document.createElement("canvas");
      savedTrail.width = trailCv.width; savedTrail.height = trailCv.height;
      savedTrail.getContext("2d").drawImage(trailCv, 0, 0);
    }
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    dpr = Math.min(window.devicePixelRatio || 1, Math.min(W, H) < 600 ? 1.5 : 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx0.setTransform(dpr, 0, 0, dpr, 0, 0);
    trailCv.width = canvas.width; trailCv.height = canvas.height;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (oldW && oldH) {
      var scale = Math.min(W, H) / Math.min(oldW, oldH);
      function remap(p, velocity) {
        if (!p || p.x == null) return;
        p.x = W / 2 + (p.x - oldW / 2) * scale;
        p.y = H * .47 + (p.y - oldH * .47) * scale;
        if (velocity) { p.vx *= scale; p.vy *= scale; }
      }
      spirits.forEach(function (s) { remap(s, true); });
      remap(ember, false);
      ember.sparks.concat(ember.burst).forEach(function (s) { remap(s, true); });
      remap(hand.cursor, false);
      hand.cursor.px = hand.cursor.x; hand.cursor.py = hand.cursor.y; hand.cursor.speed = 0;
      if(scene===SCENE.ASCEND)spirits.forEach(projectAscensionSpirit);
      else if (scene === SCENE.BLOOM) spirits.forEach(projectBloomSpirit);
      else { projectP2Encounter(); spirits.forEach(projectHerdSpirit); }
      P2.frameShift.x = 0; P2.frameShift.y = 0;
      particles.forEach(function (p) { p.x *= W / oldW; p.y *= H / oldH; });
      if (savedTrail) {
        tctx.fillStyle = "#000"; tctx.fillRect(0, 0, W, H);
        tctx.drawImage(savedTrail, 0, 0, savedTrail.width, savedTrail.height,
          (W - oldW * scale) / 2, H * .47 - oldH * .47 * scale, oldW * scale, oldH * scale);
      }
    }
    var target = clamp(Math.round(W * H / 15000), 50, 150);
    while (particles.length < target) particles.push(createParticle());
    particles.length = target;
  }

  /* ============================================
     火种（初光火种 · 将熄未熄）
     ============================================ */
  var ember = {
    alpha: 0,          // 淡入程度 0→1
    lit: false,        // 是否已点亮
    gutterAt: 3.5,     // 下一次"气若游丝"的 ritual 场景时刻
    gutterT: -1,       // 濒熄进行中的起始时刻，-1 = 无
    sparks: [],        // 常态上浮的火星
    nextSparkAt: 0,    // 下一颗火星生成时刻
    rings: [],         // 邀请环 / 冲击环
    burst: [],         // 点亮瞬间迸发的火星
    scale: 1,          // 生命周期·缩小：点亮后缓收为小小一团常明灯火
    x: null, y: null,  // 当前位置（阶段一中火种即掌心光晕：跟手走，无手归中心）
    speed: 0           // 移动速度（光灵受惊判定用）
  };

  function emberHome() {
    // "家"：中央略偏上悬浮，避开手机底部安全区
    return { x: W / 2, y: H * 0.47 };
  }

  function emberPos() {
    if (ember.x == null) { var h = emberHome(); ember.x = h.x; ember.y = h.y; }
    return { x: ember.x, y: ember.y };
  }

  // 火种亮度：慢呼吸 + 不规则颤动 + 周期性"濒熄"
  function emberBrightness(nowS) {
    if (ember.lit) {
      // 点亮后：稳定暖光，仅温和呼吸
      return 0.92 + Math.sin(nowS * 1.1) * 0.06;
    }
    var b = 0.62
      + Math.sin(nowS * 1.4) * 0.18        // 慢呼吸
      + Math.sin(nowS * 3.7 + 1.3) * 0.10  // 中速起伏
      + Math.sin(nowS * 9.1 + 4.2) * 0.05; // 高频细颤

    // "气若游丝"：每 3.5–6.5 秒一次，亮度骤然跌落并打冷颤
    if (ember.gutterT < 0 && sceneClock > ember.gutterAt) ember.gutterT = sceneClock;
    if (ember.gutterT >= 0) {
      var g = (sceneClock - ember.gutterT) / 0.9;   // 0.9s 濒熄窗口
      if (g >= 1) {
        ember.gutterT = -1;
        ember.gutterAt = sceneClock + 3.5 + Math.random() * 3;
      } else {
        var env = Math.sin(g * Math.PI);            // 0→1→0 包络
        var shiver = 0.5 + 0.5 * Math.sin(sceneClock * 55);
        b *= 1 - env * (0.72 + 0.22 * shiver);
      }
    }
    return clamp(b, 0.04, 1.6);
  }

  // 火种生命周期与牵引迁移：
  // 缩小 —— 点亮后缓缓收拢成一小团常明灯火（1 → 0.45）
  // 阶段一 —— 火种直接成为掌心光晕：手入镜时贴手跟随，检测不到手时回归屏幕中心
  function updateEmberLife(dt) {
    if(scene===SCENE.ASCEND){
      var ep=ascensionScreen(P4.leader.x,P4.leader.y);
      ember.x=ep.x;ember.y=ep.y;ember.speed=0;
      ember.scale+=(.45-ember.scale)*(1-Math.exp(-dt));
      ember.alpha=P4.beat===4?1-clamp(P4.beatClock/3,0,1):1;return;
    }
    if (scene === SCENE.BLOOM) {
      var pos = bloomScreen(P3.leader.x,P3.leader.y);
      ember.x=pos.x;ember.y=pos.y;ember.scale+=(.45-ember.scale)*Math.min(dt,1);
      ember.speed=0;return;
    }
    if (scene === SCENE.HERD && P2.leader) {
      var worldPos = p2Screen(P2.leader.x, P2.leader.y);
      ember.x = worldPos.x; ember.y = worldPos.y;
      ember.scale += (.45 - ember.scale) * Math.min(dt * .8, 1);
      ember.speed = Math.hypot(P2.scrollVX,P2.leaderVY) * p2Unit();
      return;
    }
    var scaleT = ember.lit ? 0.45 : 1;
    ember.scale += (scaleT - ember.scale) * Math.min(dt * 0.8, 1);

    if (ember.x == null) { var h = emberHome(); ember.x = h.x; ember.y = h.y; }
    var hm = emberHome();
    var tx = hm.x, ty = hm.y;
    var herding = scene === SCENE.AWAKEN || scene === SCENE.HERD;
    if (herding && hand.present) { tx = hand.cursor.x; ty = hand.cursor.y; }
    if (scene === SCENE.HERD) {
      tx = clamp(tx, W * .18, W * .86);
      ty = clamp(ty, H * .14, H * .80);
    }
    var kf = Math.min(dt * 4.5, 1);
    var mvx = (tx - ember.x) * kf, mvy = (ty - ember.y) * kf;
    ember.x += mvx;
    ember.y += mvy;
    var instSpd = dt > 0 ? Math.hypot(mvx, mvy) / dt : 0;
    ember.speed = lerp(ember.speed, Math.min(instSpd, 3000), 0.25);
  }

  // 生成一颗常态火星（自火种缓缓升起）
  function spawnSpark(nowS, pos) {
    ember.sparks.push({
      x: pos.x + rand(-4, 4),
      y: pos.y - rand(0, 6),
      vx: rand(-3, 3),
      vy: rand(-14, -26),
      r: rand(0.6, 1.4),
      age: 0,
      life: rand(1.2, 2.2)
    });
    ember.nextSparkAt = nowS + rand(0.4, 1.1);
  }

  // 常态邀请环：一圈极淡的涟漪缓慢扩散，示意"捏我"
  function spawnInviteRing() {
    ember.rings.push({ age: 0, life: 1.7, maxR: Math.min(W, H) * 0.16, alpha: 0.16, width: 1 });
  }

  // 点亮瞬间：冲击环 + 火星迸发
  function spawnIgniteBurst(pos) {
    ember.rings.push({ age: 0, life: 1.1, maxR: Math.min(W, H) * 0.42, alpha: 0.45, width: 2 });
    ember.rings.push({ age: -0.18, life: 1.1, maxR: Math.min(W, H) * 0.42, alpha: 0.30, width: 1.5 });
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = rand(40, 190);
      ember.burst.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,   // 略向上偏
        r: rand(0.8, 2.0),
        age: 0,
        life: rand(0.6, 1.4)
      });
    }
  }

  /* ---------- 火种层绘制（加色混合发光；阶段一中火种即掌心光晕） ---------- */
  // 火种与孵光核共用连续渐变，避免同心圆叠加形成生硬的光圈边缘。
  function drawSoftEmberGlow(dc,x,y,r,color,alpha) {
    if(r<=0||alpha<=0)return;
    var g=dc.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgbaStr(color,alpha));
    g.addColorStop(.4,rgbaStr(color,alpha*.35));
    g.addColorStop(1,rgbaStr(color,0));
    dc.fillStyle=g;dc.beginPath();dc.arc(x,y,r,0,Math.PI*2);dc.fill();
  }
  function drawEmberLayer(nowS, dt) {
    var pos = emberPos();
    var awaken = scene === SCENE.AWAKEN || scene === SCENE.HERD || scene === SCENE.BLOOM || scene===SCENE.ASCEND;
    pos.y += Math.sin(nowS * 0.6) * H * (awaken ? 0.002 : 0.006);   // 掌晕几乎不沉浮

    // 点亮演出期间的亮度覆盖：0.35s 冲顶 → 回落到稳态
    var b;
    if (scene === SCENE.IGNITING) {
      var up = easeOutCubic(clamp(sceneClock / 0.35, 0, 1));
      var down = easeInOutCubic(clamp((sceneClock - 0.35) / (IGNITE_DURATION - 0.35), 0, 1));
      b = lerp(lerp(0.7, 2.3, up), 1.0, down);
    } else {
      b = emberBrightness(nowS);
    }

    var master = ember.alpha;
    if (master < 0.01) return;   // 尚未淡入（此时火星/环/迸发不存在）

    var baseR = Math.min(W, H) * 0.011;
    var coreR = baseR * (0.85 + 0.35 * b) * ember.alpha * ember.scale;
    var haloR = coreR * (6 + 5 * b);

    ctx.globalCompositeOperation = "lighter";

    if (awaken) {
      // 阶段一：火种 = 掌心光晕 —— 暖色呼吸掌晕贴手而走，捏合时收缩变暖，
      // 常明灯火收在晕心（下方亮芯）
      var pinching = hand.pinch.active || (scene===SCENE.HERD&&P2.ballT>0);
      var br = 0.92 + 0.08 * Math.sin(nowS * 2.2);
      var pr = Math.min(W, H) * (pinching ? 0.026 : 0.042) * br;
      var col = pinching ? [255,226,170] : [255,240,208];
      var pa = master * (pinching ? 0.42 : 0.28);
      drawSoftEmberGlow(ctx,pos.x,pos.y,pr*2.2,col,pa);
    } else if (haloR > 0.5) {
      // 外层暖光晕（仪式 / 点亮演出）
      var g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, haloR);
      g.addColorStop(0, "rgba(255, 243, 214," + (0.34 * b * master).toFixed(3) + ")");
      g.addColorStop(0.35, "rgba(242, 193, 78," + (0.10 * b * master).toFixed(3) + ")");
      g.addColorStop(1, "rgba(242, 193, 78, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 亮芯
    if (coreR > 0.3) {
      ctx.fillStyle = "rgba(255, 248, 231," + (clamp(0.95 * b, 0, 1) * master).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 常态火星（未点亮时缓慢升起，亮度随火种呼吸）
    if (scene === SCENE.RITUAL && nowS > ember.nextSparkAt && ember.sparks.length < 8) {
      spawnSpark(nowS, pos);
    }
    updateDrawSparkList(ember.sparks, dt, b * 0.55, true);

    // 邀请环（仅 ritual）
    if (scene === SCENE.RITUAL && sceneClock > 1.2 && ember.rings.length === 0) {
      spawnInviteRing();
    }
    for (var i = ember.rings.length - 1; i >= 0; i--) {
      var rg = ember.rings[i];
      rg.age += dt;
      if (rg.age < 0) continue;
      var q = rg.age / rg.life;
      if (q >= 1) { ember.rings.splice(i, 1); continue; }
      var rr = easeOutCubic(q) * rg.maxR;
      ctx.strokeStyle = "rgba(255, 243, 214," + ((1 - q) * rg.alpha).toFixed(3) + ")";
      ctx.lineWidth = rg.width;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 点亮迸发的火星
    updateDrawSparkList(ember.burst, dt, 1.0, false);

    ctx.globalCompositeOperation = "source-over";

    // 点亮演出的全屏暖闪（叠加在最上层）
    if (scene === SCENE.IGNITING) {
      var f = Math.sin(clamp(sceneClock / IGNITE_DURATION, 0, 1) * Math.PI);
      if (f > 0.01) {
        var fr = Math.max(W, H) * 0.75;
        var fg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, fr);
        fg.addColorStop(0, "rgba(255, 243, 214," + (f * 0.30).toFixed(3) + ")");
        fg.addColorStop(1, "rgba(255, 243, 214, 0)");
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function updateDrawSparkList(list, dt, alphaScale, gentle) {
    for (var i = list.length - 1; i >= 0; i--) {
      var s = list[i];
      s.age += dt;
      if (s.age >= s.life) { list.splice(i, 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (gentle) s.x += Math.sin(s.age * 5) * 6 * dt;   // 常态火星轻微摆动
      var k = 1 - s.age / s.life;
      ctx.fillStyle = "rgba(255, 236, 200," + (k * alphaScale).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.5 + 0.5 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ============================================
     光灵（阶段一 · 圆点幼体 —— 方案 5.2 / 5.8 / 5.4）

     形态：近白亮芯 + 双层径向光晕（加色混合），低频正弦呼吸，
     运动方向微椭圆摆动（幼体扭动）；冷白单色 #BFD9E8，
     个体差异 = 尺寸 / 亮度 / 呼吸相位。拖尾由帧覆盖法自然形成（5.7）。
     ============================================ */
  var spirits = [];
  var heroSpirit = null;          // 第一只光灵（节拍 1 的主角）

  function makeSpirit(x, y, opts) {
    opts = opts || {};
    return {
      x: x, y: y, vx: 0, vy: 0,
      size: opts.size || rand(0.8, 1.15),     // 尺寸个体差
      bright: opts.bright || rand(0.85, 1.1), // 亮度个体差
      breathePh: Math.random() * Math.PI * 2, // 呼吸相位（群体越大相位差越丰富）
      breatheSpd: rand(1.0, 1.6),
      wanderPh: Math.random() * Math.PI * 2,
      mode: opts.mode || "flock",             // hero = 脚本化主角；flock = 群体成员
      heroState: opts.heroState || null,
      orbitA: rand(0, Math.PI * 2),           // 群体轨道角（黄金角分散在唤醒时指定）
      orbitR: rand(0.7, 1.3),                 // 轨道半径系数
      fleeT: 0,                               // 受惊逃窜剩余时间
      bornT: 0,                               // 出生时长（唤醒脉冲/淡入）
      flash: 0,                               // 共鸣/受惊亮度包络
      lane: 0,                                // 阶段二 ribbon 队形槽位序号
      straggleT: 0,                           // 碰礁掉队剩余时间（>0 时脱队漂移，可收拢）
      hitCd: 0,                               // 碰礁冷却（防止连续弹开）
      shadowDim: 1                            // 掠食者阴影下的暗化系数
    };
  }

  /* ---------- 光灵绘制（加色发光，单层自然衰减光晕 + 亮芯；
     形态演变方案 5.2：阶段一圆点幼体 → 阶段二纺锤身体 + 摆尾，随 morphT 渐变） ---------- */
  function drawSpirit(s, nowS) {
    if(scene===SCENE.ASCEND&&s.ascendAlpha<=.001)return;
    var breathe = 0.72 + 0.28 * Math.sin(nowS * s.breatheSpd + s.breathePh);
    var wake = clamp(s.bornT / 0.9, 0, 1);                       // 唤醒淡入
    var pop = 1 + Math.sin(wake * Math.PI) * 0.45 * (wake < 1 ? 1 : 0); // 唤醒亮度脉冲
    var lit = clamp((0.55 + 0.45 * breathe) * s.bright * wake + s.flash, 0, 2.4) * s.shadowDim;
    if(scene===SCENE.ASCEND)lit*=s.ascendAlpha==null?1:s.ascendAlpha;

    var speed = Math.hypot(s.vx, s.vy);
    var formT = morphT;                                          // 形态渐变 0 幼体 → 1 成体
    var stretch = clamp(speed / 320, 0, 0.38) * (1 - formT * 0.5); // 成体后纺锤接管拉伸
    if(scene===SCENE.ASCEND)stretch+=(s.ascendStretch||0)*.9;
    var ang = speed > 4 ? Math.atan2(s.vy, s.vx) : 0;
    var coreR = Math.min(W, H) * 0.0032 * s.size * pop;   // 萤火级：与背景光尘同量级、略大
    var haloR = coreR * (5.5 + 2.0 * breathe + s.flash * 1.2);

    // 体色渐变：冷白（阶段一）→ 青蓝（阶段二，方案 5.6）
    var cHalo0 = mixRgb([214, 236, 252], [150, 215, 252], formT);
    var cHalo1 = mixRgb([191, 217, 232], [79, 195, 247], formT);
    var cHalo2 = mixRgb([150, 195, 235], [36, 110, 170], formT);
    var cCore  = mixRgb([234, 246, 255], [225, 245, 255], formT);
    if((scene===SCENE.BLOOM||scene===SCENE.ASCEND) && s.bloomColor){
      cHalo1=mixRgb(cHalo1,s.bloomColor,bloomMix);
      cHalo0=mixRgb(cHalo0,mixRgb(s.bloomColor,[255,255,255],.45),bloomMix);
      cHalo2=mixRgb(cHalo2,s.bloomColor.map(function(v){return v*.5;}),bloomMix);
      cCore=mixRgb(cCore,mixRgb(s.bloomColor,[255,255,255],.72),bloomMix);
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);
    ctx.scale(1 + stretch, 1 - stretch * 0.55);

    // 光晕：单层多档近似指数衰减，由芯向外自然消散（无生硬分层）
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, haloR);
    g.addColorStop(0,    rgbaStr(cHalo0, 0.34 * lit));
    g.addColorStop(0.28, rgbaStr(cHalo1, 0.15 * lit));
    g.addColorStop(0.6,  rgbaStr(cHalo2, 0.045 * lit));
    g.addColorStop(1,    rgbaStr(cHalo2, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, haloR, 0, Math.PI * 2); ctx.fill();

    if (formT > 0.03) {
      // 阶段二成体：纺锤形身体 + 摆动尾鳍（朝向随速度旋转）
      var bl = coreR * (1 + 1.6 * formT);
      var bw = Math.max(coreR * (1 - 0.3 * formT), 0.6);
      var wag = Math.sin(nowS * 9 + s.wanderPh * 4) * bl * 0.45;
      if(scene===SCENE.BLOOM||scene===SCENE.ASCEND){
        ctx.fillStyle=rgbaStr(cHalo1,.22*lit*bloomMix);ctx.beginPath();
        ctx.moveTo(-bl*.5,0);ctx.quadraticCurveTo(-bl*1.5,-bw*2.8+wag*.2,-bl*2.2,-bw*2.1+wag);
        ctx.quadraticCurveTo(-bl*1.6,0,-bl*2.2,bw*2.1+wag);
        ctx.quadraticCurveTo(-bl*1.4,bw*2.8+wag*.2,-bl*.5,0);ctx.fill();
      }
      ctx.strokeStyle = rgbaStr(cHalo1, clamp(0.55 * lit, 0, 1));
      ctx.lineWidth = Math.max(bw * 0.55, 0.5);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-bl * 0.7, 0);
      ctx.quadraticCurveTo(-bl * 1.4, wag * 0.4, -bl * 1.8, wag);
      ctx.stroke();
      ctx.fillStyle = rgbaStr(cCore, clamp(0.95 * lit, 0, 1));
      ctx.beginPath(); ctx.ellipse(0, 0, bl, bw, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // 阶段一幼体：简单圆点
      ctx.fillStyle = rgbaStr(cCore, clamp(0.95 * lit, 0, 1));
      ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  /* ============================================
     阶段一 · 节拍状态机（beat 1-3，方案 3.1）
     ============================================ */
  var P1 = {
    beat: 0,              // 0 未开始 / 1 第一只光灵 / 2 星散苏醒 / 3 首次共鸣 / 4 完成
    beatClock: 0,
    orbitRot: 0,          // 群体环流的全局转角
    speedBoost: 0,        // 共鸣环流时的群体速度加成
    gatherHold: 0,        // 张手保持时长（驱动唤醒）
    wakeTimer: 0,         // 唤醒间隔计时
    scatterCd: 0,         // 握拳退散冷却
    icon: null            // 角落极简图标："gather" | "disperse" | null
  };
  var resonanceFlash = 0; // 首次共鸣的全屏冷白闪光包络
  var BEAT2_TARGET = 20;  // 阶段一推进条件：群体 20 只
  var P1_TIMING = {
    soloOrbitTurns: 1.0, // 第一只环游一圈后，同伴加入；它仍继续完成两圈
    gatherHold: 0.45,    // 张手保持多久开始唤醒（秒）
    wakeInterval: 0.38,  // 后续光灵逐只出现的间隔（秒）
    resonancePause: 0.65,// 共鸣闪光后的停顿（秒）
    groupOrbitSeconds: 2.6 // 最后群体环流一圈的时长（秒）
  };

  function newHeroState(name) {
    return {
      name: name,
      cycleT: 0,                       // approach 的冲—停循环计时
      dart: rand(0.35, 0.5),           // 每段冲刺时长
      pause: rand(0.35, 0.6),          // 每段停留观察时长
      lastAng: null,                   // orbit 角度累积用
      orbited: 0,                      // 已环游角度（受惊不清零，失败软处理）
      t: 0,                            // stay / startle 状态计时
      frightCd: 1.2,                   // 受惊冷却（登场保护期）
      doneNotified: false
    };
  }

  function changeHero(s, name) {
    var old = s.heroState;
    var fresh = newHeroState(name);
    fresh.orbited = old.orbited;
    fresh.doneNotified = old.doneNotified;
    fresh.frightCd = name === "startle" ? 2.5 : Math.max(old.frightCd, 0.8);
    s.heroState = fresh;
  }

  // 阶段一的牵引目标 = 火种本身：火种跟手走、无手归中心（无摄像头也能完整体验）
  function phase1Target() {
    var e = emberPos();
    return { x: e.x, y: e.y, speed: ember.speed };
  }

  /* ---------- 节拍 1：第一只光灵（脚本化主角） ---------- */
  function updateHeroSpirit(s, dt, nowS, tp) {
    var st = s.heroState;
    var orbitR = Math.min(W, H) * 0.16;
    var dx = tp.x - s.x, dy = tp.y - s.y;
    var dist = Math.hypot(dx, dy) || 1;

    if (st.name === "approach") {
      // 试探着游来：冲一小段 → 停下观察 → 再冲，像怕生的小鱼
      st.cycleT += dt;
      if (dist < orbitR * 1.35) changeHero(s, "orbit");
      else if (st.cycleT % (st.dart + st.pause) < st.dart) {
        var sp = clamp(dist * 1.1, 60, 185);
        s.vx = lerp(s.vx, dx / dist * sp, dt * 5);
        s.vy = lerp(s.vy, dy / dist * sp, dt * 5);
      } else {
        s.vx = lerp(s.vx, 0, dt * 4);
        s.vy = lerp(s.vy, 0, dt * 4);
      }
    } else if (st.name === "orbit") {
      // 绕光晕环游：切向速度 + 径向回拉，累积满两圈后驻留
      var ang = Math.atan2(s.y - tp.y, s.x - tp.x);
      if (st.lastAng === null) st.lastAng = ang;
      var dA = normAngle(ang - st.lastAng);
      st.lastAng = ang;
      st.orbited += Math.abs(dA);
      var tang = ang + Math.PI / 2;
      var spO = clamp(orbitR * 1.5, 75, 135);
      var homeX = tp.x + Math.cos(ang) * orbitR;
      var homeY = tp.y + Math.sin(ang) * orbitR;
      s.vx = lerp(s.vx, Math.cos(tang) * spO + (homeX - s.x) * 1.8, dt * 3.5);
      s.vy = lerp(s.vy, Math.sin(tang) * spO + (homeY - s.y) * 1.8, dt * 3.5);
      // 同伴提前加入，第一只继续环游；保留完整动作而减少独自等待。
      if (P1.beat === 1 && !st.doneNotified && st.orbited >= Math.PI * 2 * P1_TIMING.soloOrbitTurns) {
        st.doneNotified = true;
        startBeat2();
      }
      if (st.orbited >= Math.PI * 4) changeHero(s, "stay");
    } else if (st.name === "stay") {
      // 安心停留：光晕近旁的 8 字漂浮
      st.t += dt;
      var hx = tp.x - orbitR * 0.45 + Math.sin(st.t * 0.9) * orbitR * 0.32;
      var hy = tp.y + Math.sin(st.t * 1.8) * orbitR * 0.18;
      s.vx = lerp(s.vx, (hx - s.x) * 2.2, dt * 3);
      s.vy = lerp(s.vy, (hy - s.y) * 2.2, dt * 3);
      if (P1.beat === 1 && st.t > 2.5 && !st.doneNotified) { st.doneNotified = true; startBeat2(); }
    } else if (st.name === "startle") {
      // 受惊退开：逃窜减速，镇定后重新试探接近
      st.t += dt;
      s.vx = lerp(s.vx, 0, dt * 1.8);
      s.vy = lerp(s.vy, 0, dt * 1.8);
      if (st.t > 1.4) changeHero(s, "approach");
    }

    // 猛动受惊（手速超阈值）：亮一下、反向逃窜
    if (st.name !== "startle" && tp.speed > 720 && st.frightCd <= 0) {
      changeHero(s, "startle");
      s.vx = -(dx / dist) * 520;
      s.vy = -(dy / dist) * 520;
      s.flash = 1;
    }
    st.frightCd = Math.max(st.frightCd - dt, 0);

    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.bornT += dt;
    s.flash = Math.max(s.flash - dt * 1.4, 0);
  }

  /* ---------- 群体成员（轻量群体行为：轨道槽位 + 分离 + 游移） ---------- */
  function updateFlockSpirit(s, dt, nowS, tp) {
    s.wanderPh += dt * 0.7;
    var R = Math.min(W, H) * 0.17 * s.orbitR;
    var a = s.orbitA + P1.orbitRot;
    var gx = tp.x + Math.cos(a) * R + Math.cos(s.wanderPh * 1.3) * 14;
    var gy = tp.y + Math.sin(a) * R + Math.sin(s.wanderPh) * 14;
    var desX = (gx - s.x) * 1.8;
    var desY = (gy - s.y) * 1.8;

    // 分离：与邻居保持个体空间
    for (var j = 0; j < spirits.length; j++) {
      var o = spirits[j];
      if (o === s) continue;
      var sx = s.x - o.x, sy = s.y - o.y;
      var d2 = sx * sx + sy * sy;
      if (d2 < 1600 && d2 > 0.01) {           // 40px 个体空间
        var d = Math.sqrt(d2);
        desX += sx / d * (40 - d) * 4;
        desY += sy / d * (40 - d) * 4;
      }
    }

    var maxV = s.fleeT > 0 ? 420 : 55 + P1.speedBoost * 220;   // 阶段一运动慢
    s.fleeT = Math.max(s.fleeT - dt, 0);
    s.vx = lerp(s.vx, clamp(desX, -maxV, maxV), dt * 2.2);
    s.vy = lerp(s.vy, clamp(desY, -maxV, maxV), dt * 2.2);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.bornT += dt;
    s.flash = Math.max(s.flash - dt * 1.2, 0);
  }

  /* ---------- 节拍推进 ---------- */
  function startBeat1() {
    scene = SCENE.AWAKEN;
    sceneClock = 0;
    P1.beat = 1;
    P1.beatClock = 0;
    trailMode = true;
    // 拖尾层起点：铺实纯黑，避免上一场景残影混入光带
    tctx.fillStyle = "#000";
    tctx.fillRect(0, 0, W, H);
    // 第一只光灵从画面外的黑暗中登场
    var ang = rand(0, Math.PI * 2);
    var R = Math.hypot(W, H) / 2 + 80;
    var e = emberPos();
    heroSpirit = makeSpirit(e.x + Math.cos(ang) * R, e.y + Math.sin(ang) * R, {
      mode: "hero", heroState: newHeroState("approach"), size: 1.15, bright: 1.15
    });
    spirits.push(heroSpirit);
  }

  function startBeat2() {
    if (P1.beat >= 2) return; // 第一只继续环游/驻留时不重复重置唤醒计时
    P1.beat = 2;
    P1.beatClock = 0;
    P1.gatherHold = 0;
    P1.wakeTimer = 0;
    P1.icon = "gather";         // 角落极简图标：提示张手（无文字教学，方案 4.3）
  }

  function startBeat3() {
    Journey.woken=Math.max(Journey.woken,spirits.length);
    P1.beat = 3;
    P1.beatClock = 0;
    P1.icon = null;
    P1.groupOrbitDone = false;
    resonanceFlash = 1;                       // 全屏冷白共鸣闪光
    for (var i = 0; i < spirits.length; i++) spirits[i].flash = 1.2;  // 全体同步亮一下
    P1.speedBoost = 1;                        // 群体环流提速窗口
  }

  // 唤醒一颗沉睡光点：直接由标题页遗留的粒子转化（同源相续），远处优先
  function wakeOneSpirit() {
    var idx = -1;
    var minD = Math.min(W, H) * 0.2;
    for (var i = 0; i < particles.length; i++) {
      var d = Math.hypot(particles[i].x - W / 2, particles[i].y - H * 0.47);
      if (d > minD && Math.random() < 0.4) { idx = i; break; }
    }
    var x, y;
    if (idx >= 0) {
      x = particles[idx].x;
      y = particles[idx].y;
      particles.splice(idx, 1);
    } else {                                   // 粒子耗尽则从黑暗边缘新生
      var a = rand(0, Math.PI * 2);
      var R = Math.hypot(W, H) * 0.45;
      x = W / 2 + Math.cos(a) * R;
      y = H * 0.47 + Math.sin(a) * R;
    }
    var s = makeSpirit(x, y);
    s.orbitA = Math.atan2(y - H * 0.47, x - W / 2) - P1.orbitRot;   // 入场即落位当前环流
    spirits.push(s);
  }

  // 握拳：群体受惊退散（冷却防连发）
  function scatterSpirits(tp) {
    if (P1.scatterCd > 0) return;
    P1.scatterCd = 0.9;
    for (var i = 0; i < spirits.length; i++) {
      var s = spirits[i];
      if (s.mode !== "flock") continue;
      var dx = s.x - tp.x, dy = s.y - tp.y;
      var d = Math.hypot(dx, dy) || 1;
      var sp = rand(240, 400);
      s.vx += dx / d * sp;
      s.vy += dy / d * sp;
      s.fleeT = rand(0.5, 0.9);
      s.flash = 0.7;
    }
  }

  function updateBeat2(dt, tp) {
    var g = currentGesture();
    P1.scatterCd = Math.max(P1.scatterCd - dt, 0);

    if (g === "Gather") {
      P1.gatherHold += dt;
    } else if (g === "Disperse") {
      P1.gatherHold = 0;
      scatterSpirits(tp);
      if (P1.gatherHold < P1_TIMING.gatherHold) P1.icon = "gather";
    } else {
      P1.gatherHold = Math.max(P1.gatherHold - dt * 0.5, 0);   // 中性缓慢衰减
    }

    // 张手保持片刻后进入苏醒流，仍逐只唤醒并保留 20 只的群体规模。
    if (P1.gatherHold >= P1_TIMING.gatherHold) {
      P1.icon = null;
      P1.wakeTimer += dt;
      if (P1.wakeTimer >= P1_TIMING.wakeInterval && spirits.length < BEAT2_TARGET) {
        P1.wakeTimer = 0;
        wakeOneSpirit();
      }
    }

    if (spirits.length >= BEAT2_TARGET) startBeat3();
  }

  function updateBeat3(dt) {
    // 共鸣闪光稍歇后，群体完整环流一圈，再进入阶段二。
    if (P1.beatClock > P1_TIMING.resonancePause && !P1.groupOrbitDone) {
      P1.orbitRot += dt * (Math.PI * 2 / P1_TIMING.groupOrbitSeconds);
      P1.groupOrbitAcc = (P1.groupOrbitAcc || 0) + dt * (Math.PI * 2 / P1_TIMING.groupOrbitSeconds);
      if (P1.groupOrbitAcc >= Math.PI * 2) {
        P1.groupOrbitDone = true;
        P1.beat = 4;                          // 阶段一完成
        if (heroSpirit && heroSpirit.mode === "hero") {
          heroSpirit.mode = "flock";          // 主角归群
          heroSpirit.heroState = null;
        }
        enterHerd();                          // 无缝滑入阶段二 · 放牧（方案：一段式旅程）
      }
    }
    if (P1.groupOrbitDone) P1.speedBoost = Math.max(P1.speedBoost - dt * 0.8, 0);
  }

  /* ============================================
     阶段二 · 放牧（方案 3.2：横向卷轴 · ribbon 队列 · 礁石双缝 · 掠食者两连）
     节拍 1 下潜启程：手速映射群体流速（快则疾行、慢则巡游）
     节拍 2 礁石双缝：宽缝安全 / 窄缝附生光尘（为阶段三攒起始规模），
             碰礁散落掉队，掌晕靠近可收拢；损失过半则光尘飘来补充（失败软处理）
     节拍 3 掠食者两连：巨影掠过（无实体，只有让光灵变暗的阴影）——
             第一次捏合收缩成球避险、过后张手炸开逃逸；
             第二次阴影在边缘徘徊，捏合蓄力 1s 弹出诱饵光球引开它（方案 P1）
     ============================================ */
  /* ============================================
     阶段二 · 放牧：共享水彩世界 / 两道礁缝 / 掠食者两连
     图片从 assets/images/ 加载，路线数据内嵌在本文件。
     光灵仍调用原 drawSpirit()，光晕、亮芯、摆尾、呼吸与拖尾保持原样。
     ============================================ */
  // 阶段二：自由游群、可上下探索的双水道、途中掠影与随机采尘。
  var P2 = {};
  var P2Art = { images: {}, mask: null, routes: null, ready: false, failed: false, fade: 0, loading: false };
  var herdHud = document.getElementById("herd-hud");
  var herdTitle = document.getElementById("herd-title");
  var herdCue = document.getElementById("herd-cue");
  var herdProgress = document.getElementById("herd-progress");

  function resetPhase2() {
    P2 = { beat: 0, beatClock: 0, scrollVX: 0, leaderVY: 0, distance: 0, travel: 0,
      passedGaps: 0, dustBonus: 0, lastDustSound:-1, lost:0, restored:0, shadow: null, shadowCount: 0, shadowWarning:null,
      pinchHold: 0, prevPinch: false, lure: null, ballT: 0, contracting:false, burstDone: false, icon: null,
      camera: { x: 0, y: 0 }, frameShift: { x: 0, y: 0 }, leader: null,
      route: 0, routeLocked: false, routeChoice: -1, preview: false,
      completion: 0, cueClock: 0, assetWait: 0, progress: 0, blocked: false,
      dust: [], dustReady: false, dustFx: [], entrySlide:0, exitAge:0, exitSlide:0 };
    if (herdHud) herdHud.hidden = true;
    if (herdProgress) herdProgress.textContent = "0%";
  }

  function p2Unit() { return Math.min(W, H) / 900; }
  function p2CompactGesture() {
    var gesture=currentGesture();
    // 握拳在放牧阶段表示护住光群；其他阶段仍使用各自的手势含义。
    return hand.present&&(hand.pinch.active||gesture==='Disperse'||gesture==='Closed_Fist');
  }
  function p2Screen(x, y) {
    var u = p2Unit();
    return { x: W / 2 + (x - P2.camera.x) * u, y: H * .47 + (y - P2.camera.y) * u };
  }
  function p2SampleRoute(points, x) {
    if (x <= 0) return points[0];
    if (x >= points[points.length - 1].x) return points[points.length - 1];
    var lo = 0, hi = points.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (points[mid].x <= x) lo = mid; else hi = mid; }
    var a = points[lo], b = points[hi], t = (x - a.x) / (b.x - a.x);
    return { x: x, y: lerp(a.y, b.y, t), top: lerp(a.top, b.top, t),
      bottom: lerp(a.bottom, b.bottom, t), safeRadius: Math.min(a.safeRadius, b.safeRadius) };
  }
  function p2RouteAt(x, routeIndex) {
    return p2SampleRoute((P2Art.routes || P2_CHANNEL_LAYOUT.routes)[routeIndex == null ? P2.route : routeIndex].points, x);
  }

  function p2ExpandedBounds(upper, lower) {
    // 保留曲折的中心线，扩开水体，压缩岩层；世界外缘与中间岩层始终有厚度。
    var middle = (upper.y + lower.y) / 2;
    var a = Math.min(Math.max((upper.bottom - upper.top) * 1.075, 280), upper.y - 64, middle - upper.y - 100);
    var b = Math.min(Math.max((lower.bottom - lower.top) * 1.2, 220), 3136 - lower.y, lower.y - middle - 100);
    return [0, upper.y - a, upper.y + a, lower.y - b, lower.y + b, 3200];
  }

  function buildP2Terrain(image) {
    var rawRoutes = P2_CHANNEL_LAYOUT.routes;
    P2Art.routes = rawRoutes.map(function (r, ri) {
      return { id: r.id, name: r.name, points: r.points.map(function (p) {
        var pair = p2ExpandedBounds(p2SampleRoute(rawRoutes[0].points, p.x), p2SampleRoute(rawRoutes[1].points, p.x));
        var top = pair[1 + ri * 2], bottom = pair[2 + ri * 2];
        return { x: p.x, y: p.y, top: top, bottom: bottom, safeRadius: Math.min(p.safeRadius * 1.8, (bottom - top) * .42) };
      }) };
    });
    var c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    var mc = c.getContext("2d", { willReadFrequently: true });
    var sy = image.height / 3200;
    // 这是游戏内的地形绘制变换：同一份图像的五条连续区域按列重映射。
    // 不换横竖屏素材；完成后直接从这张拓宽后的画布读取碰撞。
    for (var x = 0; x < image.width; x++) {
      var wx = (x + .5) / image.width * 4800;
      var upper = p2SampleRoute(rawRoutes[0].points, wx), lower = p2SampleRoute(rawRoutes[1].points, wx);
      var src = [0, upper.top, upper.bottom, lower.top, lower.bottom, 3200];
      var dst = p2ExpandedBounds(upper, lower);
      for (var j = 0; j < 5; j++) {
        mc.drawImage(image, x, src[j] * sy, 1, (src[j + 1] - src[j]) * sy,
          x, dst[j] * sy, 1, (dst[j + 1] - dst[j]) * sy);
      }
    }
    var rgba = mc.getImageData(0, 0, c.width, c.height).data, alpha = new Uint8Array(c.width * c.height);
    for (var i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    P2Art.images.reef = c;
    P2Art.mask = { width: c.width, height: c.height, alpha: alpha };
  }

  function initPhase2Art() {
    if (P2Art.loading || P2Art.ready) return;
    P2Art.loading = true;
    Promise.all(Object.keys(P2_IMAGE_FILES).map(function (key) {
      return new Promise(function (resolve, reject) {
        var image = new Image();
        image.onload = function () {
          try {
            P2Art.images[key] = image;
            if (key === "reef") buildP2Terrain(image);
            resolve();
          } catch (error) { reject(error); }
        };
        image.onerror = function () { reject(new Error("无法加载阶段二图层：" + P2_IMAGE_FILES[key])); };
        image.src = P2_IMAGE_FILES[key];
      });
    })).then(function () { P2Art.ready = true; }).catch(function (error) {
      P2Art.failed = true; console.warn(error);
    });
  }

  function enterHerd() {
    initPhase2Art(); resetPhase2();
    herdHud.dataset.phase="2";document.querySelector(".herd-chapter").textContent="02 / THE DESCENT";
    scene = SCENE.HERD; sceneClock = 0;
    var u = p2Unit(), pos = emberPos();
    // 通道在右侧等待；保留阶段一火种的屏幕位置，不将它拉回画面中央。
    var edge=Math.max(W*.78,pos.x+W*.16);
    P2.camera.x=(W/2-edge)/u;
    P2.leader = { x: P2.camera.x+(pos.x-W/2)/u, y: p2RouteAt(0).y };
    P2.camera.y = P2.leader.y - (pos.y - H * .47) / u;
    P2.entrySlide=Math.max(0,(W+40-edge)/u);
    spirits.forEach(function (s, i) {
      s.lane = i; s.straggleT = 0; s.shadowDim = 1;
      s.wx = P2.camera.x + (s.x - W / 2) / u;
      s.wy = P2.camera.y + (s.y - H * .47) / u;
      s.wvx = s.vx / u; s.wvy = s.vy / u;
      s.swimClock = rand(.3, 1.6); s.swimX = rand(-125, 110); s.swimY = rand(-125, 125);
      s.swimTX = s.swimX; s.swimTY = s.swimY; s.dustTarget = null;
    });
    resizePhase2();
    if (herdHud) herdHud.hidden = false;
    setHerdBeat(0);
    var sound=document.getElementById('bloom-sound');sound.hidden=false;
    sound.textContent=bloomAudioEnabled?'旅程声音：开':'旅程声音：关';
  }

  function setHerdBeat(beat) {
    P2.beat = beat; P2.beatClock = 0; P2.cueClock = 0;
    if(beat===4){P2.shadowWarning=null;P2.exitAge=0;P2.exitSlide=Math.max(0,p2Screen(4800,0).x/p2Unit())+100;}
    if (herdTitle) herdTitle.textContent = beat === 2 ? (P2.route ? "采尘深径" : "回澜长廊") : beat === 4 ? "微光仍在" : beat === 1 ? "选择航道" : "放牧";
    if (herdCue) herdCue.textContent = beat === 4 ? "光群穿过了海沟，你守住了这片微光" : "手放上半屏选宽缝，下半屏选窄缝；移向右侧启程";
    if (herdHud) herdHud.dataset.beat = String(beat);
  }

  function p2RockOffset() {
    return (P2.entrySlide*(1-easeInOutCubic(morphT))-
      P2.exitSlide*easeInOutCubic(clamp(P2.exitAge/3.6,0,1)))*p2Unit();
  }

  function drawP2Layer(index) {
    if (scene !== SCENE.HERD || !P2Art.ready || morphT < .001) return;
    var u = p2Unit(), fade = easeInOutCubic(morphT) * P2Art.fade;
    ctx.save(); ctx.globalCompositeOperation = "source-over";
    if (index === 0) {
      var side = Math.max(W, H) * 1.12;
      ctx.globalAlpha = .78 * fade;
      ctx.drawImage(P2Art.images.base, W / 2 - side / 2, H / 2 - side / 2, side, side);
    } else if (index === 1) {
      var sideX = Math.max(W * 1.4, 4800 * u), sideY = Math.max(H * 1.4, 3200 * u);
      ctx.globalAlpha = .11 * fade;
      ctx.drawImage(P2Art.images.far, W / 2 - sideX / 2 - P2.camera.x * u * .12,
        H / 2 - sideY / 2 - (P2.camera.y - 1600) * u * .12, sideX, sideY);
    } else if (index === 3) {
      // 前景仅在地图外缘；不在通道里增加没有碰撞提示的遮挡。
      ctx.globalAlpha = .42 * P2Art.fade;
      ctx.translate(p2RockOffset(),0);
      var top = p2Screen(0, -360), bottom = p2Screen(0, 3100);
      ctx.drawImage(P2Art.images.front, top.x, top.y, 4800 * u, 420 * u);
      ctx.drawImage(P2Art.images.front, bottom.x, bottom.y, 4800 * u, 420 * u);
    }
    ctx.restore();
  }
  function drawFarReefs() { drawP2Layer(0); drawP2Layer(1); }

  // 从主礁石透明度直接建立碰撞，禁止把水道再近似成竖直矩形。
  function p2Solid(x, y) {
    if (x < 0 || x >= 4800) return false;
    if (y < 0 || y >= 3200) return true;
    var mask = P2Art.mask;
    if (!mask) return true; // 素材未就绪时暂停进入地图。
    var mx = Math.floor(x / 4800 * mask.width), my = Math.floor(y / 3200 * mask.height);
    return mask.alpha[my * mask.width + mx] >= 96;
  }
  function p2Blocked(x, y, radius) {
    if (p2Solid(x, y)) return true;
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      if (p2Solid(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) return true;
    }
    return false;
  }
  function p2Move(body, dx, dy, radius) {
    var count = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 6)), blocked = false;
    dx /= count; dy /= count;
    for (var i = 0; i < count; i++) {
      if (!p2Blocked(body.x + dx, body.y + dy, radius)) { body.x += dx; body.y += dy; }
      else {
        blocked = true;
        if (!p2Blocked(body.x + dx, body.y, radius)) body.x += dx;
        if (!p2Blocked(body.x, body.y + dy, radius)) body.y += dy;
      }
    }
    return blocked;
  }



  function p2SeedDust() {
    P2.dust = [];
    [32, 112].forEach(function (count, ri) {
      for (var i = 0; i < count; i++) {
        for (var trial = 0; trial < 36; trial++) {
          var x = 100 + (i + rand(.1, .9)) / count * 4600, section = p2RouteAt(x, ri);
          var y = rand(section.top + 40, section.bottom - 40);
          if (!p2Blocked(x, y, 20)) {
            P2.dust.push({ x: x, y: y, route: ri, taken: false, phase: rand(0, Math.PI * 2) });
            break;
          }
        }
      }
    });
    P2.dustReady = true;
  }

  function p2LineClear(x, y, tx, ty, radius) {
    var n = Math.max(1, Math.ceil(Math.hypot(tx - x, ty - y) / 24));
    for (var i = 1; i <= n; i++) if (p2Blocked(lerp(x, tx, i / n), lerp(y, ty, i / n), radius)) return false;
    return true;
  }

  function herdSwimTarget(s, dt, nowS) {
    s.swimClock -= dt;
    if (s.swimClock <= 0) {
      s.swimClock = rand(.8, 2.6);
      var a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      s.swimTX = Math.cos(a) * r * 155; s.swimTY = Math.sin(a) * r * 170;
    }
    s.swimX = lerp(s.swimX, s.swimTX, Math.min(dt * 1.5, 1));
    s.swimY = lerp(s.swimY, s.swimTY, Math.min(dt * 1.5, 1));
    var compact = P2.ballT > 0;
    var x = P2.leader.x + s.swimX * (compact ? .1 : 1);
    var y = P2.leader.y + s.swimY * (compact ? .1 : 1) + Math.sin(nowS * 1.1 + s.wanderPh) * (compact ? 1.5 : 14);
    if(!P2.routeLocked)x=Math.min(x,-30);
    s.dustTarget = null;
    if (!compact && !P2.shadow && P2.routeLocked) {
      var best = 180 * 180;
      P2.dust.forEach(function (dust) {
        if (dust.taken || dust.route !== P2.route || Math.hypot(dust.x - P2.leader.x, dust.y - P2.leader.y) > 350) return;
        var d = (dust.x - s.wx) * (dust.x - s.wx) + (dust.y - s.wy) * (dust.y - s.wy);
        if (d < best && p2LineClear(s.wx, s.wy, dust.x, dust.y, 8)) { best = d; s.dustTarget = dust; }
      });
      if (s.dustTarget) { x = s.dustTarget.x; y = s.dustTarget.y; }
    }
    if (x > 0 && x < 4800) {
      var section = p2RouteAt(x);
      y = clamp(y, section.top + 38, section.bottom - 38);
    }
    if (P2.routeLocked && !p2LineClear(s.wx, s.wy, x, y, 10)) {
      // 只在岩壁挡住直线时沿弯道找近处的引导点，平时不分配队列槽位。
      x = s.wx + clamp(x - s.wx, -65, 65);
      var here = p2RouteAt(x);
      y = here.y + clamp(y - p2RouteAt(P2.leader.x).y, -(here.bottom - here.top) * .2, (here.bottom - here.top) * .2);
    }
    return { x: x, y: y };
  }

  function projectHerdSpirit(s) {
    var p = p2Screen(s.wx, s.wy), u = p2Unit();
    s.x = p.x; s.y = p.y; s.vx = s.wvx * u; s.vy = s.wvy * u;
  }
  function updateHerdSpirit(s, dt, nowS) {
    var target = herdSwimTarget(s, dt, nowS), body = { x: s.wx, y: s.wy };
    s.hitCd = Math.max(0, s.hitCd - dt); s.straggleT = Math.max(0, s.straggleT - dt);
    s.fleeT = Math.max(0, s.fleeT - dt);
    var compact=P2.ballT>0,pull=compact?5.5:2.3;
    var desX = (target.x-s.wx)*pull+P2.scrollVX*.9;
    var desY = (target.y-s.wy)*pull+P2.leaderVY*.9;
    if(P2.contracting)s.fleeT=0; // 再次握拳立即接管，松手时仍保留短暂的释放演出。
    var alignedX = 0, alignedY = 0, neighbors = 0;
    for (var i = 0; i < spirits.length; i++) {
      var other = spirits[i]; if (other === s) continue;
      var dx = s.wx - other.wx, dy = s.wy - other.wy, d = Math.hypot(dx, dy);
      var space = compact ? 10 : 38, separation=compact?1.6:3;
      if (d > .01 && d < space) { desX += dx / d * (space - d) * separation; desY += dy / d * (space - d) * separation; }
      if (d < 115) { alignedX += other.wvx; alignedY += other.wvy; neighbors++; }
    }
    if (neighbors) { desX += (alignedX / neighbors - s.wvx) * .12; desY += (alignedY / neighbors - s.wvy) * .12; }
    // 探到岩壁时提前轻推，真正碰撞仍由同一张地形遮罩处理。
    for (var k = 0; k < 8; k++) {
      var a = k * Math.PI / 4, ax = Math.cos(a), ay = Math.sin(a);
      if (p2Solid(s.wx + ax * 32, s.wy + ay * 32)) { desX -= ax * 90; desY -= ay * 90; }
    }
    var maxSpeed = compact ? 720 : 560;
    var speed = Math.hypot(desX, desY);
    if (speed > maxSpeed) { desX *= maxSpeed / speed; desY *= maxSpeed / speed; }
    if (s.fleeT <= 0) {
      var follow=1-Math.exp(-dt*(compact?10:4.8));
      s.wvx = lerp(s.wvx, desX, follow);
      s.wvy = lerp(s.wvy, desY, follow);
    }
    var hit = p2Move(body, s.wvx * dt, s.wvy * dt, 8);
    s.wx = body.x; s.wy = body.y;
    if (hit) {
      s.wvx *= .65; s.wvy *= .65;
      if (s.hitCd <= 0) { s.flash = .3; s.hitCd = .8; s.straggleT = .8; }
    }
    s.bornT += dt; s.flash = Math.max(0, s.flash - dt * 1.2);
    projectHerdSpirit(s);
    var dim = 1, sh = P2.shadow;
    if (sh) {
      var d = Math.pow((s.wx - sh.wx) / sh.wrx, 2) + Math.pow((s.wy - sh.wy) / sh.wry, 2);
      if (d < 1) dim = P2.ballT > 0 ? .7 : .25 + d * .3;
    }
    s.shadowDim += (dim - s.shadowDim) * Math.min(dt * 5, 1);
  }

  function spawnShadow(pass) {
    var x = P2.camera.x + W / p2Unit() * .56 + 100;
    P2.shadow = { wx: x, wy: p2RouteAt(x).y, wrx: 360, wry: 180,
      x: 0, y: 0, rx: 0, ry: 0, state: "sweep", pass: pass, age: 0, lingerT: 0, fade: 1 };
    P2.burstDone = false; P2.prevPinch = false; P2.pinchHold = 0; P2.cueClock = 0;
  }
  function updateHerdPopulation(dt,active) {
    if(!active||dt<=0)return;
    var sh=P2.shadow;
    spirits=spirits.filter(function(s){
      s.predatorGrace=Math.max(0,(s.predatorGrace||0)-dt);
      if(!sh||sh.fade<.35||s.predatorGrace>0)return true;
      // 只有实体腹部接触造成死亡，外围柔暗影不作为致死范围。
      var hit=Math.pow((s.wx-sh.wx)/(sh.wrx*.55),2)+Math.pow((s.wy-sh.wy)/(sh.wry*.5),2)<1;
      if(hit){P2.lost++;P2.dustFx.push({x:s.wx,y:s.wy,age:0,life:.6});}
      return !hit;
    });
    P2.dust.forEach(function(dust){
      if(dust.taken||dust.route!==P2.route)return;
      var eating=Math.hypot(P2.leader.x-dust.x,P2.leader.y-dust.y)<32||spirits.some(function(s){return Math.hypot(s.wx-dust.x,s.wy-dust.y)<26;});
      if(!eating)return;
      dust.taken=true;P2.dustBonus++;
      herdDustSound();
      P2.dustFx.push({x:dust.x,y:dust.y,age:0,life:.6});
      if(spirits.length>=100)return;
      var extra=makeSpirit(ember.x,ember.y);extra.wx=dust.x;extra.wy=dust.y;
      extra.wvx=0;extra.wvy=0;extra.swimClock=.5;extra.swimX=extra.swimTX=0;extra.swimY=extra.swimTY=0;
      extra.shadowDim=1;extra.straggleT=0;extra.predatorGrace=1.2;extra.flash=.9;
      projectHerdSpirit(extra);spirits.push(extra);P2.restored++;
    });
  }
  function projectP2Encounter() {
    var u = p2Unit();
    if (P2.shadow) {
      var sh = P2.shadow, p = p2Screen(sh.wx, sh.wy);
      sh.x = p.x; sh.y = p.y; sh.rx = sh.wrx * u; sh.ry = sh.wry * u;
    }
    if (P2.lure) { var p = p2Screen(P2.lure.wx, P2.lure.wy); P2.lure.x = p.x; P2.lure.y = p.y; }
  }
  function beginShadowExit(direction) {
    var sh=P2.shadow;if(!sh||sh.state==='exit')return;
    sh.state='exit';sh.exitDirection=direction;sh.exitSpeed=150;sh.fade=1;
    P2.icon=null;P2.prevPinch=false;P2.pinchHold=0;
  }
  function moveShadowExit(dt) {
    var sh=P2.shadow,u=p2Unit();
    sh.exitSpeed+=(250-sh.exitSpeed)*(1-Math.exp(-dt*2));
    // 抵消镜头移动，保证掠影沿屏幕方向连续游离，不被镜头追上。
    sh.wx-=P2.frameShift.x/u;sh.wy-=P2.frameShift.y/u;
    sh.wx+=sh.exitDirection*sh.exitSpeed*dt;
    var screen=p2Screen(sh.wx,sh.wy),radius=sh.wrx*u;
    if((sh.exitDirection<0&&screen.x+radius<-24)||(sh.exitDirection>0&&screen.x-radius>W+24)){
      P2.shadow=null;P2.shadowCount++;P2.icon=null;P2.pinchHold=0;P2.prevPinch=false;P2.cueClock=0;
    }
  }
  function updateShadow(dt) {
    var sh = P2.shadow;
    if (P2.lure) {
      var l = P2.lure, route = p2RouteAt(l.wx);
      l.age += dt; l.life -= dt;
      var body = { x: l.wx, y: l.wy }, dx = 370 * dt;
      p2Move(body, dx, p2RouteAt(l.wx + dx).y - route.y, 4);
      l.wx = body.x; l.wy = body.y;
      if (l.life <= 0) P2.lure = null;
    }
    if (!sh) {
      if(P2.shadowWarning){
        P2.shadowWarning.age+=dt;
        if(P2.shadowWarning.age>=2.2){var pass=P2.shadowWarning.pass;P2.shadowWarning=null;spawnShadow(pass);}
      }else if(P2.beat===2&&P2.shadowCount<2&&P2.progress>=[.36,.62][P2.shadowCount]){
        P2.shadowWarning={age:0,pass:P2.shadowCount+1};P2.cueClock=0;
      }
      projectP2Encounter(); return;
    }
    sh.age += dt;
    if(sh.state==='exit'){
      moveShadowExit(dt);projectP2Encounter();return;
    }
    var pinching = P2.contracting;
    if (pinching) P2.pinchHold += dt;
    else {
      if (hand.present && P2.prevPinch && P2.pinchHold >= 1 && sh.pass === 2 && !P2.lure) {
        P2.lure = { wx: P2.leader.x, wy: P2.leader.y, x: 0, y: 0, life: 5.5, age: 0 };
        sh.state = "chase"; sh.lingerT = 0; P2.cueClock = 0;
      }
      if (hand.present && P2.prevPinch && !P2.burstDone) {
        P2.burstDone = true;
        spirits.forEach(function (s) {
          var a = Math.atan2(s.wy - P2.leader.y, s.wx - P2.leader.x);
          s.wvx += Math.cos(a) * 110; s.wvy += Math.sin(a) * 110; s.fleeT = .35; s.flash = .6;
        });
      }
      P2.pinchHold = 0;
    }
    P2.prevPinch = pinching; P2.icon = "disperse";
    if (sh.state === "chase" && P2.lure) {
      sh.wx += (P2.lure.wx - sh.wx) * Math.min(dt * 2, 1) + 130 * dt;
      sh.wy += (P2.lure.wy - sh.wy) * Math.min(dt * 2, 1);
      sh.lingerT += dt;
      if(sh.lingerT>2.6)beginShadowExit(1);
    } else {
      var near = sh.wx < P2.leader.x + 360 && sh.wx > P2.leader.x - 200;
      if (sh.pass === 2 && near && sh.lingerT < 2.8) { sh.lingerT += dt; sh.wx += P2.scrollVX * dt * .85; }
      else sh.wx -= 150 * dt;
      sh.wy += (p2RouteAt(sh.wx).y + (P2.leader.y - p2RouteAt(P2.leader.x).y) * .35 - sh.wy) * Math.min(dt * 2, 1);
    }
    if(sh.state!=='exit'&&(sh.state==='chase'&&!P2.lure||sh.wx+sh.wrx<P2.leader.x-180||sh.age>28))beginShadowExit(sh.state==='chase'?1:-1);
    projectP2Encounter();
  }

  function updatePhase2(dt, nowS) {
    P2.beatClock += dt; P2.cueClock += dt; P2.assetWait += dt;
    if (P2Art.ready) { morphT = Math.min(1, morphT + dt / 4.5); P2Art.fade = Math.min(1, P2Art.fade + dt / 2); }
    var oldCX = P2.camera.x, oldCY = P2.camera.y, entryShiftX=0, entryShiftY=0;
    P2.frameShift.x = 0; P2.frameShift.y = 0;
    if (!P2Art.ready) {
      if (herdCue) herdCue.textContent = P2Art.failed ? "海沟素材未能加载，请刷新后重试" : "水彩海沟正在浮现…";
      return;
    }
    if (!P2.dustReady) p2SeedDust();
    if (P2.beat === 0 && morphT >= 1) setHerdBeat(1);
    var active = hand.present || P2.preview, beforeX = P2.leader.x, beforeY = P2.leader.y;
    if(P2.beat===4)P2.exitAge+=dt;
    P2.scrollVX = 0; P2.leaderVY = 0; P2.blocked = false;
    P2.contracting=p2CompactGesture();
    P2.ballT = P2.contracting ? .28 : Math.max(0, P2.ballT - dt);
    if (active && P2.beat <= 2) {
      if (!P2.routeLocked) {
        var palmY=hand.cursor.y/H;
        // 中线留出缓冲，避免手部识别的小幅抖动让两条航道反复切换。
        var choice=P2.preview?P2.route:(P2.route===1?(palmY<.49?0:1):(palmY>.59?1:0));
        P2.route = choice;
        if (choice !== P2.routeChoice) {
          P2.routeChoice = choice; P2.cueClock = 0;
          if (herdTitle) herdTitle.textContent = choice ? "窄缝 · 采尘深径" : "宽缝 · 回澜长廊";
        }
      }
      if(!P2.routeLocked){
        // 入场及候选区沿用掌心的位置跟随；只在真正靠近所选水道入口后接管镜头。
        var entry=p2RouteAt(0),follow=1-Math.exp(-dt*4.5);
        var entryY=H*(P2.route ? .66 : .36);
        var previousX=P2.camera.x,previousY=P2.camera.y;
        P2.camera.x+=((W/2-W*.78)/p2Unit()-P2.camera.x)*(1-Math.exp(-dt*1.25));
        P2.camera.y+=(entry.y-(entryY-H*.47)/p2Unit()-P2.camera.y)*(1-Math.exp(-dt*1.25));
        entryShiftX=P2.camera.x-previousX;entryShiftY=P2.camera.y-previousY;
        // 镜头选道时平移自由水域的世界坐标，火种与光群在屏幕上保持连续。
        P2.leader.x+=entryShiftX;P2.leader.y+=entryShiftY;
        spirits.forEach(function(s){s.wx+=entryShiftX;s.wy+=entryShiftY;});
        var tx=P2.preview?-16:P2.camera.x+(clamp(hand.cursor.x,W*.06,W*.94)-W/2)/p2Unit();
        var ty=P2.preview?entry.y:P2.camera.y+(clamp(hand.cursor.y,H*.1,H*.86)-H*.47)/p2Unit();
        tx=Math.min(tx,morphT<1?-160:-16);
        P2.leader.x+=(tx-P2.leader.x)*follow;
        P2.leader.y+=(ty-P2.leader.y)*follow;
        var entryRadius=Math.max(45,(entry.bottom-entry.top)/2-30);
        if(morphT>=1&&P2.leader.x>=-32&&Math.abs(P2.leader.y-entry.y)<entryRadius){
          P2.routeLocked=true;setHerdBeat(2);
        }
      }else{
        var dx,dy;
        if(P2.preview){
          // 开发预览仍自动沿航道行进，正式交互使用掌心的二维位置。
          dx=160*dt;dy=p2RouteAt(P2.leader.x+dx).y-p2RouteAt(P2.leader.x).y;
        }else{
          var targetX=P2.camera.x+(clamp(hand.cursor.x,W*.06,W*.94)-W/2)/p2Unit();
          var targetY=P2.camera.y+(clamp(hand.cursor.y,H*.08,H*.9)-H*.47)/p2Unit();
          var vx=clamp((targetX-P2.leader.x)*6,-340,380);
          var vy=clamp((targetY-P2.leader.y)*7.5,-500,500);
          var speed=Math.hypot(vx,vy),limit=P2.contracting?390:520;
          if(speed>limit){vx*=limit/speed;vy*=limit/speed;}
          dx=vx*dt;dy=vy*dt;
        }
        // 碰撞继续依据同一张岩壁透明度遮罩，不能隔着岩壁追赶掌心。
        P2.blocked = p2Move(P2.leader, dx, dy, 16);
        if (P2.leader.x < -220 && P2.routeLocked) { P2.routeLocked = false; setHerdBeat(1); }
      }
      P2.travel = Math.max(P2.travel, P2.leader.x); P2.distance = P2.travel;
      P2.progress = clamp(P2.travel / 4800, 0, 1); P2.passedGaps = P2.progress >= 1 ? 2 : P2.progress >= .5 ? 1 : 0;
      if (P2.leader.x > 5030) {
        // 岩壁退场与掠影游离同时进行，掠影完全离屏后再交接海盆。
        if(P2.shadow)beginShadowExit(P2.shadow.state==='chase'?1:-1);
        P2.lure = null; P2.icon = null; setHerdBeat(4); P2.completion = 1;
        spirits.forEach(function (s) { s.flash = .7; });
      }
    }
    P2.scrollVX = dt > 0 ? (P2.leader.x-beforeX-entryShiftX)/dt : 0;
    P2.leaderVY = dt > 0 ? (P2.leader.y-beforeY-entryShiftY)/dt : 0;
    var k=1-Math.exp(-dt/.5);
    if(active&&P2.routeLocked&&P2.beat===2){
      // 中间区域让火种自由移动，越过活动区后镜头再平滑跟进。
      var deltaX=P2.leader.x-P2.camera.x,deadX=W/p2Unit()*.2;
      var deltaY=P2.leader.y-P2.camera.y,deadY=H/p2Unit()*.2;
      if(Math.abs(deltaX)>deadX)P2.camera.x+=clamp((deltaX-Math.sign(deltaX)*deadX)*k,-420*dt,420*dt);
      if(Math.abs(deltaY)>deadY)P2.camera.y+=clamp((deltaY-Math.sign(deltaY)*deadY)*k,-500*dt,500*dt);
    }
    var u = p2Unit();
    P2.frameShift.x = (oldCX-P2.camera.x+entryShiftX)*u;
    P2.frameShift.y = (oldCY-P2.camera.y+entryShiftY)*u;
    if ((active && P2.beat === 2)||(P2.beat===4&&P2.shadow)) updateShadow(dt);
    else if (!active) { P2.prevPinch = false; P2.pinchHold = 0; }
    projectP2Encounter();
    spirits.forEach(function (s) { updateHerdSpirit(s, dt, nowS); });
    if(P2.beat<=2)updateHerdPopulation(dt,active);
    P2.dustFx.forEach(function (fx) { fx.age += dt; });
    P2.dustFx = P2.dustFx.filter(function (fx) { return fx.age < fx.life; });
    if (herdProgress) herdProgress.textContent = (P2.route ? "窄缝 " : "宽缝 ") + Math.round(P2.progress * 100) + "% · 光灵 " + spirits.length+' · 损失 '+P2.lost+' · 新生 '+P2.restored;
    if (P2.beat >= 1 && P2.beat <= 2 && herdCue) {
      herdCue.textContent = !active ? "请将手掌放回画面，旅程会在原处继续" : P2.shadowWarning ? "右侧有掠影接近，准备握拳护住光群" : P2.shadow ?
        (P2.shadow.state==='exit'?'黑影正在游离，带着微光继续前行':P2.shadow.state === "chase" ? "诱饵引开了黑影，带着光群继续前行" : P2.contracting ?
          (P2.shadow.pass===2&&P2.pinchHold>=1?"光群已聚拢，张手释放诱饵":"光灵正向火种聚拢，保持握拳护住它们"):
          P2.shadow.pass === 2 ? "黑影徘徊：握拳蓄力一秒，再张手释放诱饵" : "黑影正在通道里掠过，握拳让光灵聚向火种") :
        P2.blocked ? "岩壁就在身旁，轻移掌心回到水中" : P2.routeLocked ? "掌心上下左右移动，火种会跟随；握拳聚拢光群，靠近光尘让它们进食" : "火种会跟着掌心自由游动；上下选择水道，对准右侧入口启程";
    }
    if(P2.progress>.55 && !P3Art.error && !bloomRuntimeError) initPhase3Art();
    if(P2.beat===4){
      if(P3Art.ready && bloomP5 && P2.beatClock>1.2&&!P2.shadow){enterBloom();return;}
      if(!P3Art.error && !bloomRuntimeError)initPhase3Art();
      if(herdCue)herdCue.textContent=P3Art.error||bloomRuntimeError?"海盆尚未浮现，请重试加载旅程素材":"狭缝渐远，前方的海盆正在浮现…";
      document.getElementById("journey-status").hidden=!(P3Art.error||bloomRuntimeError);
    }
    P2.completion = Math.max(0, P2.completion - dt * .25);
    if (herdHud) herdHud.classList.toggle("quiet", active && !P2.shadow && !P2.blocked && P2.cueClock > 12);
  }

  function drawReefs(nowS) {
    if (scene !== SCENE.HERD || !P2Art.ready || morphT < .02) return;
    var u = p2Unit(), origin = p2Screen(0, 0);
    ctx.save(); ctx.globalAlpha = .94 * P2Art.fade;
    ctx.translate(p2RockOffset(),0);
    ctx.drawImage(P2Art.images.reef, origin.x, origin.y, 4800 * u, 3200 * u);
    ctx.globalCompositeOperation = "lighter";
    P2.dust.forEach(function (dust) {
      if (dust.taken) return;
      var p = p2Screen(dust.x, dust.y); if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) return;
      var tw = .5 + .5 * Math.sin(nowS * 2.4 + dust.phase), r = (2.5 + tw) * u;
      var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      glow.addColorStop(0, "rgba(242,213,140,.32)"); glow.addColorStop(1, "rgba(242,213,140,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,229,170," + (.55 + .35 * tw) + ")";
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    });
    P2.dustFx.forEach(function (fx) {
      var p = p2Screen(fx.x, fx.y), t = fx.age / fx.life;
      ctx.strokeStyle = "rgba(255,226,156," + ((1 - t) * .8) + ")"; ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, (5 + t * 23) * u, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.restore();
  }
  function drawPredatorWarning() {
    if(scene!==SCENE.HERD||!P2.shadowWarning)return;
    var warning=P2.shadowWarning,alpha=.35+.65*Math.pow(Math.sin(warning.age*Math.PI*3),2);
    var x=W-26,y=clamp(ember.y||H*.47,H*.25,H*.72);
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#f5cf8c';ctx.fillStyle='rgba(24,34,43,.8)';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.moveTo(x,y-15);ctx.lineTo(x-14,y+12);ctx.lineTo(x+14,y+12);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle='#ffe2a6';ctx.font='bold 17px Microsoft YaHei';ctx.textAlign='center';ctx.fillText('!',x,y+7);
    ctx.restore();
  }
  function drawShadow() {
    var sh = P2.shadow; if (!sh) return;
    ctx.save(); ctx.globalAlpha = sh.fade; ctx.translate(sh.x, sh.y); ctx.scale(1, sh.ry / sh.rx);
    var g = ctx.createRadialGradient(0, 0, sh.rx * .08, 0, 0, sh.rx);
    g.addColorStop(0, "rgba(1,5,11,.92)"); g.addColorStop(.55, "rgba(1,5,11,.72)"); g.addColorStop(1, "rgba(1,5,11,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, sh.rx, 0, Math.PI * 2); ctx.fill();
    // 暗色鳍翼轮廓只随掠影出现，绘制在礁石后面，不遮挡通道形状。
    var flap = Math.sin(sh.age * 2) * .05;
    ctx.scale(sh.rx, sh.rx); ctx.fillStyle = "rgba(1,5,10,.55)";
    ctx.beginPath(); ctx.moveTo(-.65, 0);
    ctx.bezierCurveTo(-.28, -.48 - flap, .18, -.65 - flap, .55, -.42);
    ctx.bezierCurveTo(.12, -.08, .24, .08, .8, .02);
    ctx.bezierCurveTo(.17, .18, .08, .17, .48, .48 + flap);
    ctx.bezierCurveTo(.08, .62 + flap, -.35, .3, -.65, 0); ctx.fill(); ctx.restore();
  }

  function drawLure(nowS) {
    var l = P2.lure; if (!l) return;
    var r = Math.min(W, H) * .012 * (.9 + .1 * Math.sin(nowS * 6));
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * 5);
    g.addColorStop(0, "rgba(242,193,78,.5)"); g.addColorStop(1, "rgba(242,193,78,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.x, l.y, r * 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff8e7"; ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }


  /* ============================================
     阶段三 · 繁衍 v6：光尘进食 → 双群共鸣 → 三枚共振种子。
     p5 实例负责光尘、漩涡流线、脉冲涟漪；既有 Canvas 保留光灵视觉。
     只有主 tick 推进模拟，p5.noLoop 避免双重动画时钟。
     ============================================ */
  var P3 = {}, P3Art = { images: {}, ready: false, loading: false, error: null };
  var bloomMix = 0, bloomBackdrop = null, bloomExitRocks = null;
  var bloomP5 = null, bloomFx = null, bloomRuntime = null, bloomRuntimeError = null;
  var bloomAudio = null, bloomAudioEnabled = true;
  var P3_PALETTE = [[79,195,247], [155,126,222], [242,193,78], [106,224,174]];
  function bloomAddColor(a,b) {
    var sum=a.map(function(v,i){return v+b[i];}), peak=Math.max.apply(Math,sum);
    return sum.map(function(v){return Math.round(v/peak*255);});
  }
  var P3_FILES = { base: 'assets/images/p3_base.webp', far: 'assets/images/p3_far.webp',
    basin: 'assets/images/p3_basin.webp', front: 'assets/images/p3_foreground.webp' };

  function resetPhase3() {
    P3={beat:0,clock:0,beatClock:0,activeTime:0,collected:0,mixed:0,dust:[],rings:[],
      leader:{x:900,y:560},camera:{x:900,y:560},frameShift:{x:0,y:0},
      vortex:0,vortexRadius:150,turn:0,path:[],inputLast:null,inputSpeed:0,returnPeak:0,
      split:0,splitReady:false,mergeHold:0,lastSide:0,splitAt:0,separated:false,
      splitAnchor:null,splitHold:0,dualHold:0,splitMode:'single',inputMissingFor:0,
      merging:false,mergeStyle:'gentle',fusion:null,prevSpacing:null,wasCentered:false,
      pulse:0,beatIndex:-1,rhythmHits:0,rhythm:null,grow:0,target:60,startCount:0,
      complete:false,completion:0,budget:[0,0,0],births:[],birthTimer:0,activeNest:-1,nurseryVisibility:1,
      feedGoal:0,feedBirths:0,feedClock:0,feedDuration:24,limit:160,eatCooldown:0,nurseries:[],
      seeds:[{mature:false,progress:0,pulse:0,age:0},{mature:false,progress:0,pulse:0,age:0},{mature:false,progress:0,pulse:0,age:0}]};
    bloomMix=0;bloomBackdrop=null;bloomExitRocks=null;
    var sound=document.getElementById('bloom-sound');if(sound)sound.hidden=true;
  }

  function prepareBloomAudio() {
    // 仅由已授权的入场点击/资源重试解锁，不申请麦克风。
    if (!bloomAudioEnabled) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!bloomAudio && AC) bloomAudio = new AC();
      if (bloomAudio && bloomAudio.state === 'suspended') bloomAudio.resume().catch(function(){});
    } catch (_) { bloomAudio = null; }
  }
  function bloomSound(kind,index) {
    if(!bloomAudioEnabled||!bloomAudio||bloomAudio.state!=='running')return;
    var time=bloomAudio.currentTime;
    if(kind==='dust'){
      if(time-(P3.lastDustSound||-1)<.1)return;P3.lastDustSound=time;
    }
    var pitches=kind==='dust'?[[523.25,587.33,659.25,783.99,880][index%5]]:
      kind==='pulse'?[index%2===0?392:261.63]:kind==='hatch'?[261.63,329.63,392]:
      kind==='seed'?[392,523.25,659.25]:[261.63,329.63,392];
    pitches.forEach(function(hz,i){
      var osc=bloomAudio.createOscillator(),gain=bloomAudio.createGain();
      var at=time+(kind==='fusion'?0:i*.065),duration=kind==='dust'?.18:kind==='fusion'?.8:.42;
      osc.type='sine';osc.frequency.value=hz;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(kind==='dust'?.012:.018/pitches.length,at+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
      osc.connect(gain);gain.connect(bloomAudio.destination);osc.start(at);osc.stop(at+duration+.03);
      osc.onended=function(){osc.disconnect();gain.disconnect();};
    });
  }
  function herdDustSound() {
    if(!bloomAudioEnabled||!bloomAudio||bloomAudio.state!=='running')return;
    var time=bloomAudio.currentTime;
    if(time-P2.lastDustSound<.08)return;
    P2.lastDustSound=time;
    var base=[392,440,523.25,587.33,659.25][(P2.dustBonus-1)%5];
    [1,1.25,1.5].forEach(function(ratio,i){
      var osc=bloomAudio.createOscillator(),gain=bloomAudio.createGain(),at=time+i*.07;
      osc.type='sine';osc.frequency.setValueAtTime(base*ratio,at);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.008/(1+i*.4),at+.065);
      gain.gain.exponentialRampToValueAtTime(.0001,at+1.15+i*.12);
      osc.connect(gain);gain.connect(bloomAudio.destination);osc.start(at);osc.stop(at+1.2+i*.12);
      osc.onended=function(){osc.disconnect();gain.disconnect();};
    });
  }
  function bloomTone(){bloomSound('pulse',P3.beatIndex);}

  function loadBloomRuntime() {
    if (bloomRuntime) return bloomRuntime;
    bloomRuntimeError = null;
    bloomRuntime = new Promise(function(resolve,reject){
      var sources = ['https://cdn.jsdelivr.net/npm/p5@1.11.11/lib/p5.min.js',
        'https://unpkg.com/p5@1.11.11/lib/p5.min.js'];
      function start() {
        try {
          new window.p5(function(p){
            p.setup = function(){p.noCanvas();p.noLoop();bloomP5=p;resolve(p);};
          });
        } catch(e){reject(e);}
      }
      function attempt(index) {
        if (window.p5) {start();return;}
        if (index >= sources.length) {reject(new Error('p5.js 未能加载'));return;}
        var script=document.createElement('script'), settled=false;
        var timer=setTimeout(failed,12000);
        function failed(){if(settled)return;settled=true;clearTimeout(timer);script.remove();attempt(index+1);}
        script.src=sources[index];script.async=true;script.onerror=failed;
        script.onload=function(){if(settled)return;settled=true;clearTimeout(timer);if(window.p5)start();else attempt(index+1);};
        document.head.appendChild(script);
      }
      attempt(0);
    }).catch(function(e){bloomRuntime=null;bloomRuntimeError=e;throw e;});
    return bloomRuntime;
  }
  function initPhase3Art() {
    if (P3Art.loading || (P3Art.ready && bloomP5)) return;
    P3Art.loading=true; P3Art.error=null;
    var images = Promise.all(Object.keys(P3_FILES).map(function(key){
      return new Promise(function(resolve,reject){
        var im=new Image();
        im.onload=function(){resolve([key,im]);};
        im.onerror=function(){reject(new Error('无法加载 '+P3_FILES[key]));};
        im.src=P3_FILES[key];
      });
    }));
    Promise.all([images,loadBloomRuntime()]).then(function(results){
      results[0].forEach(function(pair){P3Art.images[pair[0]]=pair[1];});
      P3Art.ready=true;P3Art.loading=false;P3Art.error=null;
      document.getElementById('journey-status').hidden=true;
    }).catch(function(error){
      P3Art.ready=false;P3Art.loading=false;P3Art.error=error;
      console.warn('繁衍资源加载失败',error);
    });
  }
  function bloomScreen(x,y) {
    return {x:W/2+(x-P3.camera.x)*p2Unit(),y:H*.47+(y-P3.camera.y)*p2Unit()};
  }
  function projectBloomSpirit(s) {
    var pos=bloomScreen(s.wx,s.wy);s.x=pos.x;s.y=pos.y;
    s.vx=s.wvx*p2Unit();s.vy=s.wvy*p2Unit();
  }
  function bloomBounds() {
    return {x:Math.min(670,W/p2Unit()*.42),y:Math.min(390,H/p2Unit()*.34)};
  }
  function seedBloomDust(topOnly,edible) {
    var b=bloomBounds();if(edible==null)edible=Math.random()<.65;
    var x=900+rand(-b.x*.9,b.x*.9),y=topOnly?560-b.y-20:560+rand(-b.y*.85,b.y*.8);
    return {x:x,y:y,vx:rand(-5,5),vy:rand(8,17),phase:rand(0,Math.PI*2),size:edible?rand(1.4,2.3):rand(.7,1.2),edible:edible};
  }

  function enterBloom() {
    if (scene===SCENE.BLOOM || !P3Art.ready || !bloomP5) return;
    var u=p2Unit(), ep=emberPos();
    // 水体交融与岩壁滑出分层，岩壁继续沿阶段二的退场进度向左移动。
    var old=document.createElement('canvas');old.width=canvas.width;old.height=canvas.height;
    var previousContext=ctx;ctx=old.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#06121f';ctx.fillRect(0,0,W,H);drawFarReefs();
    var rocks=document.createElement('canvas');rocks.width=canvas.width;rocks.height=canvas.height;
    ctx=rocks.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    drawReefs(performance.now()/1000);drawP2Layer(3);ctx=previousContext;
    resetPhase3();bloomBackdrop=old;
    if(P2.exitAge<3.6)bloomExitRocks={image:rocks,age:P2.exitAge,
      from:easeInOutCubic(clamp(P2.exitAge/3.6,0,1)),slide:P2.exitSlide};
    P3.leader={x:900+(ep.x-W/2)/u,y:560+(ep.y-H*.47)/u};
    P3.startCount=spirits.length;P3.target=Math.max(24,spirits.length+12,Math.round(spirits.length*1.8));
    P3.limit=P3.target+40;morphT=1;
    var growth=P3.target-P3.startCount;
    P3.budget[0]=Math.round(growth*.6);P3.budget[1]=0;P3.feedGoal=Math.max(24,P3.budget[0]*3);
    P3.budget[2]=growth-P3.budget[0]-P3.budget[1];
    spirits.forEach(function(s,i){
      s.wx=900+(s.x-W/2)/u;s.wy=560+(s.y-H*.47)/u;
      s.wvx=s.vx/u;s.wvy=s.vy/u;s.group=i%2;s.bloomColor=COLOR_P2.spirit.slice();
      s.colorIndex=i%4;s.sizeGoal=rand(.7,1.3);s.shadowDim=1;s.straggleT=0;
    });
    for(var i=0;i<95;i++)P3.dust.push(seedBloomDust(false));
    P2.scrollVX=0;P2.frameShift={x:0,y:0};P2.shadow=null;P2.lure=null;
    scene=SCENE.BLOOM;sceneClock=0;
    hand.secondary=null;
    if(hand.recognizer && !hand.debugLock){
      // 摄像头视频源不变，阶段三与阶段四共用双手识别及单手替代。
      Promise.resolve(hand.recognizer.setOptions({numHands:2})).catch(function(){/* 单手替代始终可用 */});
    }
    setBloomBeat(1);
    document.getElementById('bloom-sound').hidden=false;
    document.getElementById('bloom-sound').textContent=bloomAudioEnabled?'节拍声音：开':'节拍声音：关';
    document.getElementById('journey-status').hidden=true;
    if(P2.previewAscension){P3.complete=true;setBloomBeat(4);initPhase4Art();}
  }
  function setBloomBeat(beat) {
    P3.beat=beat;P3.beatClock=0;P3.grow=0;P3.path=[];P3.vortex=0;
    herdHud.hidden=false;herdHud.dataset.phase='3';herdHud.dataset.beat=String(beat);
    herdHud.classList.remove('quiet');
    document.querySelector('.herd-chapter').textContent='03 / BLOOM';
    herdTitle.textContent=['','引光进食','双群共鸣','群体共振','繁光初成'][beat];
    if(beat===2){
      P3.lastSide=0;P3.splitHold=0;P3.dualHold=0;P3.splitAnchor=null;
      P3.splitMode='single';P3.returnPeak=0;P3.inputLast=null;P3.inputSpeed=0;
      P3.prevSpacing=null;P3.wasCentered=false;
    }
    if(beat===3){
      P3.rhythm={time:0,index:-1,phrase:0,responses:{},failed:0,assist:false,assistEdges:0,
        assistMask:0,confirmed:null,candidate:null,stable:0,lastEdge:-10,intro:1.2,cooldown:0,steps:0,lastHitBeat:-1};
      P3.gesture='Neutral';
    }
  }
  function bloomBirth(parent, group, color) {
    if(spirits.length>=P3.limit)return false;
    var s=makeSpirit(parent.x||0,parent.y||0,{size:rand(.7,1.3),bright:rand(.8,1.2)});
    s.wx=parent.wx+rand(-16,16);s.wy=parent.wy+rand(-16,16);
    s.birthX=s.wx;s.birthY=s.wy;s.wvx=rand(-35,35);s.wvy=rand(-35,35);
    s.group=group;s.colorIndex=spirits.length%4;s.sizeGoal=s.size;
    s.natalColor=color.slice();s.bloomColor=color.slice();s.bloomBornAt=P3.clock;
    projectBloomSpirit(s);spirits.push(s);return true;
  }
  function queueBloomBirth(count,x,y,group,color,source) {
    if(count>0)P3.births.push({remaining:count,x:x,y:y,group:group,color:color.slice(),source:source});
  }
  function updateBloomBirths(dt,active) {
    if(!active || !P3.births.length)return;
    P3.birthTimer-=dt;
    while(P3.birthTimer<=0 && P3.births.length){
      var job=P3.births[0];
      bloomBirth({wx:job.x,wy:job.y},job.group==null?spirits.length%2:job.group,job.color);
      job.remaining--;P3.birthTimer+=.16;
      if(job.remaining<=0 || spirits.length>=P3.limit)P3.births.shift();
    }
  }
  function bloomRing(x,y,color,style) {
    P3.rings.push({x:x,y:y,age:0,color:color||[191,217,232],style:style||'soft'});
  }
  function bloomSeedPosition(index) {
    var a=-Math.PI/2+index*Math.PI*2/3;
    return {x:P3.leader.x+Math.cos(a)*120,y:P3.leader.y+Math.sin(a)*95};
  }
  function bloomCentroids() {
    var c=[{x:0,y:0,n:0,vx:0,vy:0},{x:0,y:0,n:0,vx:0,vy:0}];
    spirits.forEach(function(s){var t=c[s.group];t.x+=s.wx;t.y+=s.wy;t.vx+=s.wvx;t.vy+=s.wvy;t.n++;});
    c.forEach(function(t){if(t.n){t.x/=t.n;t.y/=t.n;t.vx/=t.n;t.vy/=t.n;}});return c;
  }
  function updateBloomInput(dt) {
    if(P3.beat===4 || dt<=0)return;
    // 分群以进入这一拍后的掌心位置为起点，避免宽屏需要大幅横扫。
    if(P3.beat===2&&!P3.splitAnchor)P3.splitAnchor={x:hand.cursor.x/W,y:hand.cursor.y/H};
    var b=bloomBounds(),wx=P3.camera.x+(hand.cursor.x-W/2)/p2Unit();
    var wy=P3.camera.y+(hand.cursor.y-H*.47)/p2Unit();
    wx=clamp(wx,900-b.x,900+b.x);wy=clamp(wy,560-b.y,560+b.y*.8);
    var previous=P3.inputLast;
    if(previous){
      var speed=clamp(Math.hypot(wx-previous.x,wy-previous.y)/dt,0,1000);
      P3.inputSpeed+=(speed-P3.inputSpeed)*(1-Math.exp(-dt*8));
      P3.returnPeak*=Math.exp(-dt*1.2);
      var home=P3.beat===2&&P3.splitAnchor?P3.splitAnchor.x:.5;
      if(Math.abs(hand.cursor.x/W-home)<Math.abs(previous.sx-home)-.001)
        P3.returnPeak=Math.max(P3.returnPeak,P3.inputSpeed);
    }
    P3.inputLast={x:wx,y:wy,sx:hand.cursor.x/W};
    P3.leader.x+=(wx-P3.leader.x)*(1-Math.exp(-dt*4));
    P3.leader.y+=(wy-P3.leader.y)*(1-Math.exp(-dt*4));
    var path=P3.path,prev=path[path.length-1];
    if(!prev || Math.hypot(wx-prev.x,wy-prev.y)>8){
      path.push({x:wx,y:wy,t:P3.clock});
      while(path.length>40 || (path.length && P3.clock-path[0].t>2.4))path.shift();
      var turn=0,length=0,minX=wx,maxX=wx,minY=wy,maxY=wy;
      path.forEach(function(p){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);});
      for(var i=2;i<path.length;i++){
        var a=path[i-2],c=path[i-1],d=path[i];
        turn+=normAngle(Math.atan2(d.y-c.y,d.x-c.x)-Math.atan2(c.y-a.y,c.x-a.x));
        length+=Math.hypot(d.x-c.x,d.y-c.y);
      }
      if(Math.abs(turn)>2.1 && length>100){
        P3.vortex=Math.min(1,P3.vortex+dt*5+.1);P3.turn=Math.sign(turn);
        P3.vortexRadius+=(clamp(Math.max(maxX-minX,maxY-minY)*1.05,90,240)-P3.vortexRadius)*Math.min(1,dt*3);
      }
    }
    if(P3.beat!==2 || P3.fusion)return;
    if(P3.merging){P3.split=Math.max(0,P3.split-dt*(P3.mergeStyle==='surge'?1.2:.45));return;}
    var shortSide=Math.min(W,H),offset=hand.cursor.x-P3.splitAnchor.x*W;
    var side=Math.abs(offset)>shortSide*.13?Math.sign(offset):0;
    var second=hand.secondary && performance.now()/1000-hand.secondary.at<.3?hand.secondary:null;
    var spacing=second?Math.abs(second.x-hand.cursor.x)/W:0;
    if(second && P3.prevSpacing!=null && spacing<P3.prevSpacing){
      P3.returnPeak=Math.max(P3.returnPeak,clamp((P3.prevSpacing-spacing)*W/p2Unit()/dt*.5,0,900));
    }
    P3.prevSpacing=second?spacing:null;
    P3.dualHold=second&&spacing>.30?P3.dualHold+dt:0;
    var twoApart=P3.dualHold>.18;
    if(side){
      P3.splitHold=side===P3.lastSide?P3.splitHold+dt:dt;
      P3.lastSide=side;
    }else{P3.splitHold=0;P3.lastSide=0;}
    // 任意一侧的小幅位移并停留片刻即可锁定分群，无须限时横跨左右两端。
    if(twoApart || P3.splitHold>.16){
      if(!P3.splitReady){P3.splitAt=P3.clock;P3.separated=false;P3.returnPeak=0;P3.arrivalStyle=null;}
      P3.splitReady=true;
      if(twoApart)P3.splitMode='dual';
    }
    var together=second?spacing<.2:P3.splitMode==='dual'?
      Math.abs(hand.cursor.x/W-.5)<.13:Math.abs(offset)<shortSide*.075;
    if(P3.splitReady){
      P3.split+=(1-P3.split)*(1-Math.exp(-dt*2.8));
      if(together && !P3.wasCentered)P3.arrivalStyle=P3.returnPeak>320?'surge':'gentle';
      if(together && P3.separated && P3.clock-P3.splitAt>.9)P3.mergeHold+=dt;else P3.mergeHold=0;
      if(P3.mergeHold>.35){
        P3.mergeStyle=P3.arrivalStyle||'gentle';P3.splitReady=false;P3.lastSide=0;P3.mergeHold=0;P3.merging=true;
      }
    }else{
      // 完成手势前也给出轻微游开反馈，方便判断掌心移动已被识别。
      var preview=clamp((Math.abs(offset)/shortSide-.035)/.095,0,1)*.24;
      P3.split+=(preview-P3.split)*(1-Math.exp(-dt*5));
    }
    P3.wasCentered=together;
  }
  function updateBloomSpirit(s,dt) {
    var b=bloomBounds(),pinched=hand.present&&hand.pinch.active;
    var radius=pinched?30:(P3.beat===4?100:125),gx=P3.leader.x,gy=P3.leader.y;
    var angle=s.orbitA+P3.clock*((s.group?.21:.28)+P3.vortex*.65)*(P3.turn||1);
    if(P3.beat===2){
      radius=pinched?30:95;
      gx=900+(s.group?1:-1)*P3.split*Math.min(260,b.x*.6);gy=560+(s.group?25:-25)*P3.split;
      angle=s.orbitA+P3.clock*.43*(s.group?1:-1);
      if(P3.splitReady && hand.secondary && performance.now()/1000-hand.secondary.at<.3){
        var palms=[hand.cursor,hand.secondary].sort(function(a,b){return a.x-b.x;});
        var palm=palms[s.group];
        gx=clamp(P3.camera.x+(palm.x-W/2)/p2Unit(),900-b.x*.8,900+b.x*.8);
        gy=clamp(P3.camera.y+(palm.y-H*.47)/p2Unit(),560-b.y*.7,560+b.y*.65);
      }
    }
    if(P3.beat===3){radius=pinched?30:140*(1+Math.sin((P3.rhythm.time/.9)*Math.PI)*.18);}
    if(P3.beat===4){gx=900;gy=560+b.y*.62;}
    var age=P3.clock-(s.bloomBornAt==null?-100:s.bloomBornAt);
    if(age<1.5){gx=lerp(s.birthX,gx,clamp(age/1.5,0,1));gy=lerp(s.birthY,gy,clamp(age/1.5,0,1));radius*=clamp(age/1.5,.25,1);}
    var tx=gx+Math.cos(angle+s.wanderPh)*radius*s.orbitR;
    var ty=gy+Math.sin(angle*1.15+s.wanderPh)*radius*.7;
    var ax=(tx-s.wx)*1.5,ay=(ty-s.wy)*1.5;
    for(var i=0;i<spirits.length;i++){
      var other=spirits[i];if(other===s)continue;
      var dx=s.wx-other.wx,dy=s.wy-other.wy,d2=dx*dx+dy*dy;
      if(d2>1&&d2<34*34){ax+=dx/d2*260;ay+=dy/d2*260;}
    }
    if(P3.beat===1 && P3.vortex>.08){
      var rx=s.wx-P3.leader.x,ry=s.wy-P3.leader.y;
      ax+=(-ry*.9*(P3.turn||1)-rx*.25)*P3.vortex;
      ay+=(rx*.9*(P3.turn||1)-ry*.25)*P3.vortex;
    }
    s.wvx=(s.wvx+ax*dt)*Math.exp(-dt*1.3);s.wvy=(s.wvy+ay*dt)*Math.exp(-dt*1.3);
    var speed=Math.hypot(s.wvx,s.wvy),limit=P3.beat===2&&P3.merging&&P3.mergeStyle==='surge'?330:240;
    if(speed>limit){s.wvx*=limit/speed;s.wvy*=limit/speed;}
    s.wx=clamp(s.wx+s.wvx*dt,900-b.x,900+b.x);s.wy=clamp(s.wy+s.wvy*dt,560-b.y,560+b.y);
    s.bornT+=dt;s.flash=Math.max(0,s.flash-dt*1.3);s.shadowDim=1;
    s.size+=(s.sizeGoal-s.size)*Math.min(1,dt*.35);
    var breathTarget=(s.group?.95:1.5)+Math.sin(s.wanderPh)*.12;
    s.breatheSpd+=(breathTarget-s.breatheSpd)*Math.min(1,dt*.5);
    var groupColor=s.group?P3_PALETTE[2]:P3_PALETTE[0],color=groupColor;
    s.bloomColor=mixRgb(s.bloomColor,color,Math.min(1,dt*1.5));
    s.bright+=( (s.group?.92:1.03)-s.bright)*Math.min(1,dt*.08);
    projectBloomSpirit(s);
  }

  function updateBloomDust(dt,active,g) {
    var b=bloomBounds();P3.eatCooldown=Math.max(0,P3.eatCooldown-dt);
    P3.dust.forEach(function(d){
      d.x+=(d.vx+Math.sin(P3.clock+d.phase)*5)*dt;d.y+=d.vy*dt;
      if(active&&d.edible){
        var eater=Math.hypot(P3.leader.x-d.x,P3.leader.y-d.y)<110?{wx:P3.leader.x,wy:P3.leader.y,group:0,bloomColor:P3_PALETTE[0],size:1}:null,nearest=eater?Math.hypot(P3.leader.x-d.x,P3.leader.y-d.y):110;
        spirits.forEach(function(body){var distance=Math.hypot(body.wx-d.x,body.wy-d.y);if(distance<nearest){nearest=distance;eater=body;}});
        if(eater){
          var pull=g==='Gather'?3.5:2.2;
          d.x+=(eater.wx-d.x)*pull*dt;d.y+=(eater.wy-d.y)*pull*dt;
          if(Math.hypot(eater.wx-d.x,eater.wy-d.y)<19&&P3.eatCooldown<=0){
            P3.collected++;P3.eatCooldown=.24;eater.flash=.8;
            eater.sizeGoal=Math.min(1.45,(eater.sizeGoal||eater.size)+.035);
            var total=Math.floor(Math.min(P3.collected,P3.feedGoal)*P3.budget[0]/P3.feedGoal)+Math.min(40,Math.floor(Math.max(0,P3.collected-P3.feedGoal)/3)),births=total-P3.feedBirths;
            if(births>0){queueBloomBirth(births,eater.wx,eater.wy,eater.group,eater.bloomColor||P3_PALETTE[0],'feeding');P3.feedBirths=total;}
            bloomRing(eater.wx,eater.wy,eater.bloomColor,'feeding');bloomSound('dust',P3.collected);
            Object.assign(d,seedBloomDust(true,true));
          }
        }
      }
      if(d.y>560+b.y+35||d.x<900-b.x-50||d.x>900+b.x+50)Object.assign(d,seedBloomDust(true,d.edible));
    });
  }

  function beginBloomFusion(centers) {
    P3.mixed=1;P3.merging=false;P3.splitReady=false;
    P3.mixedColor=[191,217,232]; // 共振光色，不再改变光灵体色。
    P3.fusion={x:(centers[0].x+centers[1].x)/2,y:(centers[0].y+centers[1].y)/2,
      style:P3.mergeStyle,age:0,queued:false};
    P3.pulse=.8;bloomSound('fusion',0);
    if(P3.mergeStyle==='surge'){
      spirits.forEach(function(s){var a=Math.atan2(s.wy-P3.fusion.y,s.wx-P3.fusion.x);s.wvx+=Math.cos(a)*70;s.wvy+=Math.sin(a)*70;});
    }
  }
  function matureBloomSeed() {
    var seed=P3.seeds.find(function(s){return !s.mature;});if(!seed)return;
    var index=P3.seeds.indexOf(seed),pos=bloomSeedPosition(index);
    seed.mature=true;seed.age=0;seed.progress=1;P3.rhythm.cooldown=.65;
    var count=Math.floor(P3.budget[2]/3)+(index<P3.budget[2]%3?1:0);
    queueBloomBirth(count,pos.x,pos.y,null,P3.mixedColor,'seed');
    bloomRing(pos.x,pos.y,P3.mixedColor,'seed');bloomSound('seed',index);P3.pulse=1;
  }
  function updateBloomRhythm(dt,active,g) {
    var r=P3.rhythm;if(!r)return;
    P3.seeds.forEach(function(s){if(s.mature)s.age+=dt;});
    if(!active){r.confirmed=null;r.candidate=null;r.stable=0;r.inputGap=0;return;}
    if(r.intro>0){r.intro=Math.max(0,r.intro-dt);r.candidate=null;r.stable=0;return;}
    r.time+=dt;
    var index=Math.floor(r.time/.9);
    if(index!==r.index){r.index=index;P3.beatIndex=index;P3.pulse=.7;bloomTone();}
    if(r.cooldown>0){r.cooldown=Math.max(0,r.cooldown-dt);r.candidate=null;r.stable=0;return;}
    // 下一步始终按张、握、张、握推进；识别与落拍分开，漏拍后不要求追赶全局奇偶拍。
    if(g!=='Gather'&&g!=='Disperse'){
      r.inputGap=(r.inputGap||0)+dt;
      if(r.inputGap>.18){r.candidate=null;r.stable=0;}
      return;
    }
    r.inputGap=0;
    if(g===r.candidate)r.stable+=dt;else{r.candidate=g;r.stable=dt;}
    if(r.stable<.08||g===r.confirmed)return;
    var current=P3.seeds.find(function(s){return !s.mature;});if(!current)return;
    var nearest=Math.round(r.time/.9);
    var needed=(r.steps||0)%2===0?'Gather':'Disperse';
    if(g!==needed||Math.abs(r.time-nearest*.9)>.36||nearest===r.lastHitBeat)return;
    r.confirmed=g;
    r.lastHitBeat=nearest;r.steps=(r.steps||0)+1;P3.rhythmHits++;
    current.progress=r.steps/4;current.pulse=.8;P3.pulse=.9;
    if(r.steps===4){matureBloomSeed();r.steps=0;r.candidate=null;r.stable=0;}
  }
  function updatePhase3(dt) {
    P3.clock+=dt;P3.beatClock+=dt;bloomMix=clamp(bloomMix+dt/5.5,0,1);
    P3.nurseryVisibility+=((P3.beat>1?.12:1)-P3.nurseryVisibility)*(1-Math.exp(-dt*1.5));
    if(bloomMix===1)bloomBackdrop=null;
    if(bloomExitRocks){
      bloomExitRocks.age+=dt;
      if(bloomExitRocks.age>=3.6)bloomExitRocks=null;
    }
    var active=dt>0&&hand.present&&bloomMix>.85,g=active?bloomGesture():'Neutral';
    if(active){P3.inputMissingFor=0;P3.activeTime+=dt;updateBloomInput(dt);}
    else{
      P3.inputMissingFor+=dt;P3.path=[];P3.inputLast=null;P3.inputSpeed=0;P3.returnPeak=0;
      // 短暂丢帧暂停输入，保留分群起点和已完成的游开；重新入镜后继续。
      if(P3.inputMissingFor>.7){
        P3.lastSide=0;P3.splitHold=0;P3.dualHold=0;P3.mergeHold=0;P3.wasCentered=false;
      }
    }
    P3.vortex=Math.max(0,P3.vortex-dt*.25);
    if(P3.beat===4){
      P3.leader.x+=(900-P3.leader.x)*(1-Math.exp(-dt*.6));
      P3.leader.y+=(560+bloomBounds().y*.62-P3.leader.y)*(1-Math.exp(-dt*.6));
      P3.completion=Math.min(1,P3.completion+dt/5);
    }
    var oldX=P3.camera.x,oldY=P3.camera.y,follow=easeInOutCubic(clamp((bloomMix-.65)/.35,0,1));
    var tx=900+(P3.leader.x-900)*.22*follow,ty=560+(P3.leader.y-560)*.17*follow;
    P3.camera.x+=(tx-P3.camera.x)*(1-Math.exp(-dt*.8));P3.camera.y+=(ty-P3.camera.y)*(1-Math.exp(-dt*.8));
    P3.frameShift={x:(oldX-P3.camera.x)*p2Unit(),y:(oldY-P3.camera.y)*p2Unit()};

    updateBloomDust(dt,P3.beat===1&&active,g);
    if(P3.beat===1&&active)P3.feedClock+=dt;
    spirits.forEach(function(s){updateBloomSpirit(s,dt);});
    var centers=bloomCentroids(),separation=Math.hypot(centers[0].x-centers[1].x,centers[0].y-centers[1].y);
    P3.separation=separation;P3.centers=centers;
    if(P3.beat===2&&P3.split>.6&&separation>150)P3.separated=true;
    if(active&&P3.beat===2&&P3.merging&&P3.split<.24&&separation<200){
      var touch=false;
      for(var i=0;i<spirits.length&&!touch;i++)for(var j=i+1;j<spirits.length;j++){
        if(spirits[i].group!==spirits[j].group&&Math.hypot(spirits[i].wx-spirits[j].wx,spirits[i].wy-spirits[j].wy)<42){touch=true;break;}
      }
      if(touch)beginBloomFusion(centers);
    }
    if(P3.fusion && P3.beat===2 && active){
      P3.fusion.age+=dt;
      if(P3.fusion.age>1.8&&!P3.fusion.queued){
        P3.fusion.queued=true;queueBloomBirth(P3.budget[1],P3.fusion.x,P3.fusion.y,null,P3.mixedColor,'fusion');
      }
      if(P3.fusion.age>4.2&&!P3.births.length)setBloomBeat(3);
    }
    if(P3.beat===3)updateBloomRhythm(dt,active,g);
    updateBloomBirths(dt,active);
    if(active&&P3.beat===1&&P3.feedClock>=P3.feedDuration&&P3.collected>=P3.feedGoal&&!P3.births.length)setBloomBeat(2);
    if(P3.beat===3&&P3.seeds.every(function(s){return s.mature;})&&!P3.births.length&&spirits.length>=P3.target){
      P3.complete=true;setBloomBeat(4);P3.pulse=1;
    }
    P3.pulse=Math.max(0,P3.pulse-dt*1.8);
    P3.seeds.forEach(function(s){s.pulse=Math.max(0,s.pulse-dt*1.7);});
    P3.rings.forEach(function(r){r.age+=dt;});P3.rings=P3.rings.filter(function(r){return r.age<2;}).slice(-9);
    updateBloomHud(active);
    if(P3.beat>=2&&!P4Art.ready&&!P4Art.loading&&!P4Art.error)initPhase4Art();
    if(P3.beat===4&&P3.completion>=1){
      if(P4Art.ready&&bloomP5){enterAscension();return;}
      herdCue.textContent=P4Art.error?'海面尚未展开，光群会在此等候':'前方的海水正在变亮，微光正在准备上升…';
      if(P4Art.error){
        document.getElementById('journey-message').textContent='终章素材未能加载，光群和繁衍进度已保留。';
        document.getElementById('journey-status').hidden=false;
      }
    }
  }
  function updateBloomHud(active) {
    var cue='',progress='';
    if(P3.beat===1){
      cue='带着光群游向光尘，靠近进食；张开手掌可加快吸收';
      progress='光尘 '+P3.collected+' · 保底光尘 '+P3.feedGoal+' · 进食余时 '+Math.ceil(Math.max(0,P3.feedDuration-P3.feedClock))+'秒 · 光灵 '+spirits.length;
    }else if(P3.beat===2){
      cue=P3.fusion?(P3.fusion.style==='surge'?'两道光带交汇，共振种子沿螺旋舒展':'两群微光相遇，共振种子正在诞生'):
        P3.merging?'让两群微光靠近，等待它们真正相遇':P3.splitReady?
        (P3.separated?(P3.splitMode==='dual'?'双手缓缓靠近，让两群微光交融':'掌心反向回拢，让两群微光靠近；慢回或快回，会有不同回应'):'青蓝与金色正在游开，稍等它们形成双群'):
        '单手向任一侧轻移，让光群分开，再反向回拢；也可用双手';
      progress=P3.fusion?(P3.fusion.style==='surge'?'螺旋交汇':'柔和交融'):
        P3.splitReady?(P3.separated?'双群已分开 · 等待合拢':'分群已响应 · 正在游开'):'分群相遇 · 孕育共振种子';
    }else if(P3.beat===3){
      var r=P3.rhythm,mature=P3.seeds.filter(function(s){return s.mature;}).length;
      cue=r.intro>0?'跟随节拍：张手、握拳、张手、握拳，每枚种子两次开合':
        r.cooldown>0?'一枚种子舒展开了，新的光灵正在加入':
        (r.candidate===((r.steps||0)%2===0?'Gather':'Disperse')&&r.stable>=.08?'动作已识别，跟随下一次亮点落拍':'跟随亮点'+((r.steps||0)%2===0?'张开手掌':'轻轻握拳'))+' · 每枚两次开合';
      progress='共振 '+mature+' / 3 · 本枚节拍 '+(r.steps||0)+' / 4 · 光灵 '+spirits.length+' · 保底 '+P3.target;
    }else{cue='光尘渐息，让新生的微光汇向深处';progress='光灵 '+spirits.length+' · 繁衍完成';}
    if(bloomMix<.85)cue='海盆渐渐展开，带着光群游向飘落的光尘';
    else if(!active&&P3.beat!==4)cue=P3.beat===2?'请将手掌放回画面，分群进度会保留':'请将手掌放回画面，进食与种子进度会保留';
    herdCue.textContent=cue;herdProgress.textContent=progress;
    herdHud.classList.toggle('quiet',P3.beat===4&&P3.beatClock>8);
  }


  function drawBloomEnvironment() {
    if(scene!==SCENE.BLOOM)return;
    var t=easeInOutCubic(bloomMix), u=p2Unit(), side=Math.max(W/1536,H/1024);
    var keys=['base','far','basin','front'],depth=[0,.16,.5,.95],alpha=[1,.32,.85,.82];
    keys.forEach(function(key,i){
      var d=depth[i], margin=d?.02+d*.09:0;
      var w=1536*side*(1+margin),h=1024*side*(1+margin);
      var dx=-(P3.camera.x-900)*u*d,dy=-(P3.camera.y-560)*u*d;
      ctx.save();ctx.globalAlpha=alpha[i];if(i===1)ctx.filter='brightness(1.08)';
      ctx.drawImage(P3Art.images[key],W/2-w/2+dx,H/2-h/2+dy,w,h);ctx.restore();
    });
    if(bloomBackdrop){ctx.save();ctx.globalAlpha=1-t;ctx.drawImage(bloomBackdrop,0,0,W,H);ctx.restore();}
    if(bloomExitRocks){
      var exit=bloomExitRocks,shift=-exit.slide*u*(easeInOutCubic(clamp(exit.age/3.6,0,1))-exit.from);
      ctx.save();ctx.drawImage(exit.image,shift,0,W,H);ctx.restore();
    }
  }
  function drawBloomAura(p,x,y,r,color,alpha) {
    p.noStroke();
    for(var layer=4;layer>=1;layer--){
      p.fill(color[0],color[1],color[2],alpha*(layer===1?.45:.035));
      p.circle(x,y,r*layer);
    }
  }

  function drawBloomEffects() {
    if(scene!==SCENE.BLOOM || !bloomP5)return;
    var scale=Math.min(1,1100/Math.max(W,H)),fw=Math.max(1,Math.round(W*scale)),fh=Math.max(1,Math.round(H*scale));
    if(!bloomFx || bloomFx.width!==fw || bloomFx.height!==fh){
      if(bloomFx)bloomFx.remove();bloomFx=bloomP5.createGraphics(fw,fh);bloomFx.pixelDensity(1);
    }
    var p=bloomFx;p.clear();p.push();p.scale(scale);p.blendMode(bloomP5.ADD);
    var fade=easeInOutCubic(bloomMix),u=p2Unit(),dustFade=fade*(P3.beat===4?1-P3.completion:1);
    P3.dust.forEach(function(d){
      var s=bloomScreen(d.x,d.y),r=d.size*Math.max(.6,u);
      var a=(.55+.45*Math.sin(P3.clock*1.3+d.phase))*dustFade*(d.edible?1:.35);
      p.noStroke();p.fill(255,243,214,12*a);p.circle(s.x,s.y,r*7);
      p.fill(d.edible?255:156, d.edible?243:192,d.edible?214:215,155*a);p.circle(s.x,s.y,r*1.5);
    });

    var center=bloomScreen(P3.leader.x,P3.leader.y);
    if(P3.beat===1&&P3.vortex>.02){
      p.noFill();p.strokeWeight(Math.max(.6,u));
      for(var k=0;k<4;k++){
        p.stroke(120,201,242,37*P3.vortex*fade);p.beginShape();
        for(var j=0;j<=32;j++){
          var a=j/32*Math.PI*2+P3.clock*(P3.turn||1)*.6+k*Math.PI/2;
          var r=(20+j/32*P3.vortexRadius*.8)*u;
          p.vertex(center.x+Math.cos(a)*r,center.y+Math.sin(a)*r*.75);
        }p.endShape();
      }
    }
    if(P3.beat===2&&P3.split>.1&&!P3.fusion&&P3.centers){
      P3.centers.forEach(function(c,i){
        var q=bloomScreen(c.x,c.y),color=i?P3_PALETTE[2]:P3_PALETTE[0];
        p.noFill();p.stroke(color[0],color[1],color[2],35*P3.split*fade);p.strokeWeight(Math.max(.6,u));
        p.beginShape();for(var j=0;j<=40;j++){
          var a=j/40*Math.PI*1.6+P3.clock*.3*(i?1:-1),r=(80+j*.6)*u;
          p.vertex(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r*.67);
        }p.endShape();
      });
    }
    if(P3.fusion&&P3.fusion.age<4.2&&P3.beat===2){
      var f=P3.fusion,q=bloomScreen(f.x,f.y),color=P3.mixedColor;
      var env=Math.sin(clamp(f.age/4.2,0,1)*Math.PI)*fade;
      drawBloomAura(p,q.x,q.y,(22+f.age*7)*u,color,env*70);
      p.noFill();p.strokeWeight(Math.max(.75,u));
      if(f.style==='surge'){
        for(var k=0;k<3;k++){
          p.stroke(color[0],color[1],color[2],70*env);p.beginShape();
          for(var j=0;j<=44;j++){
            var a=j/44*Math.PI*2+f.age*1.4+k*Math.PI*2/3;
            var r=(15+j*2.6+f.age*22)*u;
            p.vertex(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r*.75);
          }p.endShape();
        }
      }else{
        [-1,1].forEach(function(side){
          p.stroke(color[0],color[1],color[2],65*env);
          p.ellipse(q.x+side*(45-f.age*8)*u,q.y,(120+f.age*30)*u,(85+f.age*16)*u);
        });
      }
    }
    var seedFade=P3.beat===2&&P3.fusion?clamp((P3.fusion.age-1.8)/1.5,0,1):P3.beat===3?1:0;
    if(seedFade>0)P3.seeds.forEach(function(seed,i){
      var pos=bloomSeedPosition(i),q=bloomScreen(pos.x,pos.y),color=P3.mixedColor;
      var breathe=.8+.2*Math.sin(P3.clock*1.5+i*2),opening=seed.mature?clamp(seed.age/1.5,0,1):0;
      var a=seedFade*fade*(seed.mature?1-opening*.75:1);
      drawBloomAura(p,q.x,q.y,(18+seed.progress*7+seed.pulse*6)*u,color,(65+seed.progress*55)*a*breathe);
      p.noFill();p.stroke(color[0],color[1],color[2],155*a);p.strokeWeight(Math.max(.7,u));
      p.ellipse(q.x,q.y,(20+opening*25)*u,(32+opening*30)*u);
      p.noStroke();p.fill(240,250,245,145*a);p.circle(q.x,q.y,(5+seed.progress*2)*u);
    });
    if(P3.beat===3){
      var r=P3.rhythm,spread=.8+.2*Math.cos(r.time/.9*Math.PI),radius=(35+spread*14)*u;
      p.noFill();p.stroke(P3.mixedColor[0],P3.mixedColor[1],P3.mixedColor[2],(22+P3.pulse*45)*fade);
      p.strokeWeight(Math.max(.7,u));p.ellipse(center.x,center.y,radius*2,radius*1.55);
      for(var i=0;i<4;i++){
        var a=-Math.PI/2+i*Math.PI/2; p.noStroke();
        p.fill(220,239,242,(i===(r.steps||0)?150:35)*fade);
        p.circle(center.x+Math.cos(a)*(radius+9*u),center.y+Math.sin(a)*(radius+9*u)*.78,Math.max(2.5,4*u));
      }
    }
    p.noFill();P3.rings.forEach(function(r){
      var q=bloomScreen(r.x,r.y),a=(1-r.age/2)*fade;
      p.stroke(r.color[0],r.color[1],r.color[2],55*a);p.strokeWeight(Math.max(.6,u));
      p.ellipse(q.x,q.y,(25+r.age*130)*u,(25+r.age*130)*u*.78);
    });
    p.pop();ctx.save();ctx.globalCompositeOperation='lighter';ctx.drawImage(p.canvas,0,0,W,H);ctx.restore();
  }


  /* ============================================
     阶段四 · 点亮深渊：上举蓄势 → 四次推送 → 终闪与回响。
     保留阶段三的世界坐标、光灵对象与体色；p5 绘制星环及竖向光河。
     ============================================ */
  var P4={},P4Art={images:{},ready:false,loading:false,error:null};
  var ascensionBackdrop=null;
  var P4_FILES={base:'assets/images/p4_base.webp',far:'assets/images/p4_far.webp',
    mid:'assets/images/p4_mid.webp',front:'assets/images/p4_foreground.webp',surface:'assets/images/p4_surface.webp'};
  var ascentMic={token:0,status:'off',stream:null,context:null,source:null,analyser:null,
    samples:null,noise:.015,previous:0,lastClap:-10};

  function resetPhase4() {
    P4={beat:0,clock:0,beatClock:0,blend:0,charge:0,chargeBase:null,chargeHold:0,
      waves:0,armed:false,lowY:0,pushHold:0,cooldown:0,missing:0,lastHandY:null,
      ascent:0,surface:0,finalHold:0,clap:false,finishReason:null,rings:[],stats:null,
      clapAge:10,camera:{x:900,y:560},startCamera:{x:900,y:560},nest:{x:900,y:800},
      startNest:{x:900,y:800},leader:{x:900,y:800},frameShift:{x:0,y:0}};
    ascensionBackdrop=null;
    document.getElementById('journey-ending').hidden=true;
    document.getElementById('journey-ending').style.opacity='';
    document.getElementById('ascension-mic').hidden=true;
    document.body.dataset.ending='false';
  }
  function initPhase4Art(force) {
    if(P4Art.loading||(P4Art.ready&&bloomP5))return;
    if(P4Art.error&&!force)return;
    P4Art.loading=true;P4Art.error=null;
    var images=Promise.all(Object.keys(P4_FILES).map(function(key){
      return new Promise(function(resolve,reject){
        var image=new Image();image.onload=function(){resolve([key,image]);};
        image.onerror=function(){reject(new Error('无法加载 '+P4_FILES[key]));};image.src=P4_FILES[key];
      });
    }));
    Promise.all([images,loadBloomRuntime()]).then(function(results){
      results[0].forEach(function(row){P4Art.images[row[0]]=row[1];});
      P4Art.ready=true;P4Art.loading=false;P4Art.error=null;
      if(scene===SCENE.BLOOM&&P3.beat===4)document.getElementById('journey-status').hidden=true;
    }).catch(function(error){P4Art.loading=false;P4Art.error=error;console.warn('终章素材加载失败',error);});
  }
  function ascensionScreen(x,y) {
    return {x:W/2+(x-P4.camera.x)*p2Unit(),y:H*.47+(y-P4.camera.y)*p2Unit()};
  }
  function projectAscensionSpirit(s) {
    var point=ascensionScreen(s.wx,s.wy);s.x=point.x;s.y=point.y;
    s.vx=s.wvx*p2Unit();s.vy=s.wvy*p2Unit();
  }
  function setAscensionBeat(beat) {
    P4.beat=beat;P4.beatClock=0;P4.pushHold=0;P4.finalHold=0;
    herdHud.dataset.beat=String(beat);
    herdTitle.textContent=['','蓄势盘旋','送光回家','点亮深渊','牧光者回响'][beat];
    if(beat===2){P4.armed=false;P4.lowY=0;P4.cooldown=.5;}
    if(beat===3)P4.pendingClapUntil=0;
  }
  function enterAscension() {
    if(scene!==SCENE.BLOOM||!P4Art.ready||!bloomP5)return;
    // 只捕获环境。光群继续使用原有对象与离屏拖尾，不复制静止的光灵。
    var old=document.createElement('canvas');old.width=canvas.width;old.height=canvas.height;
    var previous=ctx;ctx=old.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle='#081826';ctx.fillRect(0,0,W,H);drawBloomEnvironment();ctx=previous;
    resetPhase4();ascensionBackdrop=old;
    P4.camera={x:P3.camera.x,y:P3.camera.y};P4.startCamera={x:P3.camera.x,y:P3.camera.y};
    P4.nest={x:P3.leader.x,y:P3.leader.y};P4.startNest={x:P3.leader.x,y:P3.leader.y};
    P4.leader={x:P3.leader.x,y:P3.leader.y};
    spirits.forEach(function(s){
      s.ascendWave=null;s.ascentAge=0;s.ascended=false;s.ascendAlpha=1;s.ascendStretch=0;
      s.shadowDim=1;projectAscensionSpirit(s);
    });
    bloomBackdrop=null;bloomExitRocks=null;P2.scrollVX=0;
    scene=SCENE.ASCEND;sceneClock=0;
    herdHud.hidden=false;herdHud.dataset.phase='4';herdHud.classList.remove('quiet');
    document.querySelector('.herd-chapter').textContent='04 / ASCENSION';
    document.getElementById('journey-status').hidden=true;
    document.getElementById('ascension-mic').hidden=false;
    document.getElementById('bloom-sound').textContent=bloomAudioEnabled?'旅程声音：开':'旅程声音：关';
    setAscensionBeat(1);
    enableAscensionMic();
    updateAscensionHud(false);
  }
  function ascensionHand() {
    if(!hand.present)return null;
    var other=hand.secondary&&performance.now()/1000-hand.secondary.at<.3?hand.secondary:null;
    var y=hand.cursor.y/H,x=hand.cursor.x/W;
    return {x:other?(x+other.x/W)/2:x,y:other?(y+other.y/H)/2:y,
      chargeY:other?Math.min(y,other.y/H):y,
      high:other?Math.max(y,other.y/H)<.27:y<.27};
  }
  function ascensionSound(index,finale) {
    if(!bloomAudioEnabled||!bloomAudio||bloomAudio.state!=='running')return;
    var base=[261.63,329.63,392,523.25][index%4],time=bloomAudio.currentTime;
    [1,1.25,1.5,2].forEach(function(ratio,i){
      var osc=bloomAudio.createOscillator(),gain=bloomAudio.createGain(),at=time+i*.11;
      osc.type='sine';osc.frequency.value=base*ratio;
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(finale?.018:.012,at+.04);
      gain.gain.exponentialRampToValueAtTime(.0001,at+(finale?2.1:.9));
      osc.connect(gain);gain.connect(bloomAudio.destination);osc.start(at);osc.stop(at+(finale?2.2:1));
      osc.onended=function(){osc.disconnect();gain.disconnect();};
    });
  }
  function launchAscensionWave() {
    if(P4.waves>=4)return;
    var waiting=spirits.filter(function(s){return s.ascendWave==null;});
    if(!waiting.length)return;
    var count=Math.ceil(waiting.length/(4-P4.waves));
    waiting.slice(0,count).forEach(function(s){s.ascendWave=P4.waves;s.ascentAge=0;s.flash=.65;});
    P4.waves++;P4.armed=false;P4.lowY=0;P4.pushHold=0;P4.cooldown=.85;
    P4.rings.push({x:P4.nest.x,y:P4.nest.y,age:0,color:P3_PALETTE[(P4.waves-1)%4]});
    ascensionSound(P4.waves-1,false);
  }
  function updateAscensionSpirit(s,dt,index) {
    if(s.ascended){projectAscensionSpirit(s);return;}
    var vx,vy,pulse=P4.clapAge<2.6?Math.pow(Math.sin(Math.PI*clamp(P4.clapAge/2.6,0,1)),1.2):0;
    if(s.ascendWave!=null){
      s.ascentAge+=dt;
      var spread=Math.min(95,W/p2Unit()*.2);
      var lane=900+Math.sin(index*2.4)*(spread+pulse*100)+Math.sin(s.ascentAge*1.3+s.wanderPh)*18;
      vx=(lane-s.wx)*2.6;vy=-(210+Math.min(1,s.ascentAge/3)*230);
      s.ascendStretch=clamp(s.ascentAge/3,0,1);
      var above=P4.camera.y-s.wy,view=H/p2Unit();
      s.ascendAlpha=1-clamp((above-view*.35)/(view*.27),0,1);
      if(above>view*.64){s.ascended=true;s.ascendAlpha=0;}
    }else{
      var radius=(95+P4.charge*35+pulse*140)*s.orbitR,angle=s.orbitA+P4.clock*(.35+P4.charge*.85);
      var tx=P4.nest.x+Math.cos(angle+s.wanderPh)*radius;
      var ty=P4.nest.y+Math.sin(angle+s.wanderPh)*radius*.24;
      vx=(tx-s.wx)*(P4.clapAge<3.4?5:2);vy=(ty-s.wy)*(P4.clapAge<3.4?5:2);
      var depthLight=(1+P4.charge*.22)*(1+Math.sin(angle+s.wanderPh)*.12);
      s.bright+=(depthLight-s.bright)*(1-Math.exp(-dt*2));
    }
    var follow=1-Math.exp(-dt*(s.ascendWave==null?(P4.clapAge<3.4?8:1.6):2.2));
    s.wvx+=(vx-s.wvx)*follow;s.wvy+=(vy-s.wvy)*follow;
    s.wx+=s.wvx*dt;s.wy+=s.wvy*dt;s.bornT+=dt;s.flash=Math.max(0,s.flash-dt*1.1);
    projectAscensionSpirit(s);
  }
  function finishAscension(reason) {
    if(P4.beat!==3)return;
    Journey.completedAt=performance.now()/1000;
    var elapsed=Journey.startedAt?Math.max(0,Math.round(Journey.completedAt-Journey.startedAt)):0;
    P4.stats={awakened:Journey.woken,gaps:P2.passedGaps,shadows:P2.shadowCount,
      population:spirits.length,seconds:elapsed,narrow:P2.route===1};
    P4.finishReason=reason;setAscensionBeat(4);ascensionSound(3,true);stopAscensionMic();
    herdHud.hidden=true;document.getElementById('ascension-mic').hidden=true;
    document.getElementById('ending-awakened').textContent=P4.stats.awakened+' 只';
    document.getElementById('ending-gaps').textContent=P4.stats.gaps+' 道';
    document.getElementById('ending-shadows').textContent=P4.stats.shadows+' 次';
    document.getElementById('ending-population').textContent=P4.stats.population+' 只';
    document.getElementById('ending-duration').textContent='这一程 · '+Math.floor(elapsed/60)+' 分 '+elapsed%60+' 秒';
    document.getElementById('ending-badge').hidden=!P4.stats.narrow;
  }
  function updateAscensionCharge(dt,sample) {
    var y=sample.chargeY==null?sample.y:sample.chargeY;
    if(P4.chargeBase==null)P4.chargeBase=clamp(y,.5,.85);
    P4.chargeBase=Math.max(P4.chargeBase,clamp(y,.5,.85));
    var raised=y<=.5||P4.chargeBase-y>=.08;
    if(raised){
      P4.charge=Math.min(1,P4.charge+dt/1.1);
      P4.chargeHold=P4.charge>=.98?P4.chargeHold+dt:0;
      if(P4.chargeHold>=.12){P4.charge=1;setAscensionBeat(2);}
    }else P4.chargeHold=Math.max(0,P4.chargeHold-dt*.5);
  }
  function updatePhase4(dt) {
    P4.clapAge+=dt;
    P4.clock+=dt;P4.beatClock+=dt;P4.blend=Math.min(1,P4.blend+dt/4.8);
    if(P4.blend===1)ascensionBackdrop=null;
    var sample=P4.blend>.85?ascensionHand():null,active=dt>0&&!!sample;
    P4.cooldown=Math.max(0,P4.cooldown-dt);
    if(active){
      P4.missing=0;P4.lastHandY=sample.y;
      if(P4.beat===1){
        updateAscensionCharge(dt,sample);
      }else if(P4.beat===2&&P4.waves<4){
        if(sample.y>.5){P4.armed=true;P4.lowY=Math.max(P4.lowY,sample.y);}
        if(P4.armed&&P4.cooldown<=0&&P4.lowY-sample.y>.13&&sample.y<.48)P4.pushHold+=dt;
        else P4.pushHold=0;
        if(P4.pushHold>.12)launchAscensionWave();
      }else if(P4.beat===3&&ascentMic.status==='error'){
        P4.finalHold=sample.high?P4.finalHold+dt:0;
        if(P4.finalHold>=2)finishAscension('hands');
      }
    }else{
      P4.missing+=dt;P4.pushHold=0;P4.finalHold=0;
      if(P4.missing>.45)P4.chargeHold=0;
      if(P4.missing>.8){P4.armed=false;P4.lowY=0;P4.lastHandY=null;}
    }
    var oldX=P4.camera.x,oldY=P4.camera.y;
    P4.ascent+=(P4.waves/4-P4.ascent)*(1-Math.exp(-dt*.7));
    P4.camera.x+=(900-P4.camera.x)*(1-Math.exp(-dt*.5));
    P4.camera.y+=(P4.startCamera.y-P4.ascent*520-P4.camera.y)*(1-Math.exp(-dt*.7));
    P4.nest.x+=(900-P4.nest.x)*(1-Math.exp(-dt*.8));
    P4.nest.y=P4.startNest.y+(P4.camera.y-P4.startCamera.y);
    P4.leader.x=P4.nest.x;P4.leader.y=P4.nest.y-P4.charge*16;
    P4.frameShift={x:(oldX-P4.camera.x)*p2Unit(),y:(oldY-P4.camera.y)*p2Unit()+dt*P4.ascent*9*p2Unit()};
    spirits.forEach(function(s,i){updateAscensionSpirit(s,dt,i);});
    P4.rings.forEach(function(r){r.age+=dt;});P4.rings=P4.rings.filter(function(r){return r.age<2.8;});
    if(P4.beat===2&&P4.waves===4&&spirits.every(function(s){return s.ascended;}))setAscensionBeat(3);
    sampleAscensionMic();
    if(P4.beat===3&&P4.pendingClapUntil>performance.now()/1000&&P4.beatClock>.3)finishAscension('clap');
    P4.clap=false;
    if(P4.beat===4){
      P4.surface=easeInOutCubic(clamp((P4.beatClock-.8)/4,0,1));
      if(P4.beatClock>4.2){
        document.getElementById('journey-ending').hidden=false;
        document.getElementById('bloom-sound').hidden=true;document.body.dataset.ending='true';
      }
      if(P4.beatClock>28){resetAll();return;}
    }else updateAscensionHud(active);
  }
  function updateAscensionHud(active) {
    var cue,progress;
    if(P4.beat===1){cue='把手掌轻抬到画面上半部，稍停片刻，让星河蓄满光';progress='蓄光 '+Math.round(P4.charge*100)+'%';}
    else if(P4.beat===2){
      cue=P4.waves===4?'最后一波微光正在游向海面':P4.armed?'向上推送掌心，送出下一波微光':'先把掌心放低，再向上推送一波微光';
      progress='送光 '+P4.waves+' / 4';
    }else{
      cue=ascentMic.status==='error'?'麦克风未获授权，可重试；也可举高手掌保持两秒完成旅程':'微光已全部回家，拍一次手，点亮海面并查看旅程结算';
      progress='光灵已全部送达 · 等待拍手';
    }
    if(P4.blend<.85)cue='海水渐亮，岩层正在身后退开…';
    else if(!active&&!(P4.beat===2&&P4.waves===4)&&P4.beat!==3)cue='请将手掌放回画面，已经送出的微光会继续上升';
    herdCue.textContent=cue;herdProgress.textContent=progress;
  }

  function drawAscensionPlate(key,opacity,depth) {
    if(opacity<=.001)return;
    var image=P4Art.images[key],u=p2Unit();
    var zoom=depth>0&&W/H<.85?1.02:1.18;
    var scale=Math.max(W/image.width,H/image.height)*zoom,w=image.width*scale,h=image.height*scale;
    var dx=-(P4.camera.x-P4.startCamera.x)*u*depth;
    var dy=(P4.startCamera.y-P4.camera.y)*u*depth;
    ctx.save();ctx.globalAlpha=opacity;ctx.drawImage(image,(W-w)/2+dx,(H-h)/2+dy,w,h);ctx.restore();
  }
  function drawAscensionEnvironment() {
    if(scene!==SCENE.ASCEND||!P4Art.ready)return;
    drawAscensionPlate('base',1,0);
    drawAscensionPlate('far',.42*(1-P4.ascent*.35)*(1-P4.surface),.16);
    drawAscensionPlate('mid',.82*(1-P4.ascent*.7)*(1-P4.surface),.52);
    drawAscensionPlate('front',.58*(1-P4.ascent*.95)*(1-P4.surface),1);
    drawAscensionPlate('surface',P4.surface,0);
    if(ascensionBackdrop){
      ctx.save();ctx.globalAlpha=1-easeInOutCubic(P4.blend);
      // 环境轻轻向下退开，光群仍独立游动。
      var zoom=1+P4.blend*.06;
      ctx.drawImage(ascensionBackdrop,W*(1-zoom)/2,0,W*zoom,H*zoom);ctx.restore();
    }
  }
  function drawAscensionEffects() {
    if(scene!==SCENE.ASCEND||!bloomP5)return;
    var scale=Math.min(1,1100/Math.max(W,H)),fw=Math.max(1,Math.round(W*scale)),fh=Math.max(1,Math.round(H*scale));
    if(!bloomFx||bloomFx.width!==fw||bloomFx.height!==fh){
      if(bloomFx)bloomFx.remove();bloomFx=bloomP5.createGraphics(fw,fh);bloomFx.pixelDensity(1);
    }
    var p=bloomFx,u=p2Unit(),fade=easeInOutCubic(P4.blend)*(1-P4.surface*.85);
    var center=ascensionScreen(P4.nest.x,P4.nest.y);
    p.clear();p.push();p.scale(scale);p.blendMode(bloomP5.ADD);
    if(P4.beat<=2){
      drawBloomAura(p,center.x,center.y,(40+P4.charge*30)*u,[151,224,228],45*fade);
      p.noFill();p.strokeWeight(Math.max(.65,u));
      for(var k=0;k<3;k++){
        var radius=(90+k*16+P4.charge*28)*u;
        p.stroke(174,222,229,(18+P4.charge*22)*fade);p.beginShape();
        for(var j=0;j<=52;j++){
          var angle=j/52*Math.PI*2+P4.clock*(.2+P4.charge*.55)+k*2;
          var rr=radius*(1+Math.sin(angle*3+P4.clock)*.035);
          p.vertex(center.x+Math.cos(angle)*rr,center.y+Math.sin(angle)*rr*.33);
        }p.endShape();
      }
      if(P4.beat===1){
        p.stroke(255,243,214,120*fade);p.strokeWeight(Math.max(1,1.5*u));p.beginShape();
        for(var j=0;j<=40;j++){
          var angle=-Math.PI/2+j/40*Math.PI*2*P4.charge;
          p.vertex(center.x+Math.cos(angle)*48*u,center.y+Math.sin(angle)*48*u);
        }p.endShape();
      }
    }
    // p5 的连续曲线为每一波建立竖向光河；真实光灵沿河游动并留下原有拖尾。
    if(P4.waves>0&&P4.beat<4){
      var amount=Math.min(1,P4.ascent*2+.15),top=-H*.12;
      for(var k=0;k<Math.min(4,P4.waves);k++){
        var color=P3_PALETTE[k],spread=Math.min(110,W*.16);
        for(var ribbon=0;ribbon<3;ribbon++){
          p.noFill();p.stroke(color[0],color[1],color[2],(ribbon===1?32:13)*fade*amount);
          p.strokeWeight(Math.max(.65,u*(ribbon===1?1.8:.8)));p.beginShape();
          for(var j=0;j<=60;j++){
            var t=j/60,y=lerp(center.y,top,t),envelope=Math.sin(t*Math.PI);
            var x=W/2+Math.sin(t*5.5-P4.clock*.65+k*1.7+ribbon*.2)*spread*(.25+envelope*.55);
            p.vertex(x,y);
          }p.endShape();
        }
      }
    }
    P4.rings.forEach(function(r){
      var q=ascensionScreen(r.x,r.y),t=r.age/2.8,color=r.color;
      p.noFill();p.stroke(color[0],color[1],color[2],65*(1-t)*fade);p.strokeWeight(Math.max(.7,u));
      p.ellipse(q.x,q.y,(45+easeOutCubic(t)*180)*u,(20+easeOutCubic(t)*65)*u);
    });
    if(P4.beat===3){
      var q=ascensionScreen(900,P4.camera.y-80),t=clamp(P4.finalHold/2,0,1);
      drawBloomAura(p,q.x,q.y,(30+t*55)*u,[255,248,231],(30+t*60)*fade);
      p.noFill();p.stroke(255,248,231,100*fade);p.strokeWeight(Math.max(.8,u));p.beginShape();
      for(var j=0;j<=48;j++){
        var a=-Math.PI/2+j/48*Math.PI*2*t;
        p.vertex(q.x+Math.cos(a)*50*u,q.y+Math.sin(a)*50*u);
      }p.endShape();
    }
    if(P4.beat===4){
      var age=P4.beatClock,burst=Math.sin(clamp(age/3,0,1)*Math.PI);
      if(age<3){
        p.noFill();p.stroke(255,248,231,100*burst);p.strokeWeight(Math.max(.7,u));
        p.ellipse(W/2,H*.42,(50+age*260)*u,(50+age*300)*u);
      }
      if(age>4.2){
        var glow=clamp((age-4.2)/2,0,1),last=null;
        // 五个节点对应本局的唤醒、礁缝、掠影、繁衍、回归。
        for(var i=0;i<5;i++){
          var x=W*(.25+i*.125),y=H*.84+Math.sin(i*1.2)*12*u;
          if(last){p.stroke(195,234,230,30*glow);p.strokeWeight(Math.max(.6,u));p.line(last.x,last.y,x,y);}
          drawBloomAura(p,x,y,9*u,[235,248,232],70*glow);last={x:x,y:y};
        }
      }
    }
    p.pop();ctx.save();ctx.drawImage(bloomFx.canvas,0,0,W,H);ctx.restore();
  }
  function drawAscensionFinalOverlay() {
    if(scene!==SCENE.ASCEND||P4.beat!==4)return;
    var age=P4.beatClock,flash=Math.pow(Math.sin(clamp(age/2.8,0,1)*Math.PI),2)*.78;
    if(flash>.001){ctx.save();ctx.fillStyle=rgbaStr([255,248,231],flash);ctx.fillRect(0,0,W,H);ctx.restore();}
    if(age>25){
      var fade=easeInOutCubic(clamp((age-25)/3,0,1));
      ctx.save();ctx.fillStyle=rgbaStr([3,8,15],fade);ctx.fillRect(0,0,W,H);ctx.restore();
      document.getElementById('journey-ending').style.opacity=String(1-fade);
    }
  }
  function stopAscensionMic() {
    ascentMic.token++;
    if(ascentMic.stream)ascentMic.stream.getTracks().forEach(function(track){track.stop();});
    if(ascentMic.source){try{ascentMic.source.disconnect();}catch(_){} }
    if(ascentMic.context)ascentMic.context.close().catch(function(){});
    ascentMic.stream=null;ascentMic.context=null;ascentMic.source=null;ascentMic.analyser=null;ascentMic.samples=null;
    ascentMic.status='off';ascentMic.noise=.015;ascentMic.previous=0;
    ascentMic.lastClap=-10;ascentMic.previousPeak=0;ascentMic.calibratedUntil=0;
    document.getElementById('mic-feedback').hidden=true;
    var button=document.getElementById('ascension-mic');button.textContent='启用拍手终闪';button.setAttribute('aria-pressed','false');
  }
  async function enableAscensionMic() {
    if(scene!==SCENE.ASCEND||P4.beat===4||ascentMic.status==='loading')return;
    if(ascentMic.status==='ready'){
      if(ascentMic.context.state!=='running')await ascentMic.context.resume();
      document.getElementById('ascension-mic').hidden=ascentMic.context.state==='running';return;
    }
    var token=++ascentMic.token,button=document.getElementById('ascension-mic');
    ascentMic.status='loading';button.textContent='正在启用拍手…';
    button.hidden=true;document.getElementById('mic-feedback').hidden=false;
    document.getElementById('mic-feedback').textContent='正在自动启用麦克风，请允许浏览器的麦克风权限';
    var audioContext=null,stream=null;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      if(!AC||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('麦克风不可用');
      audioContext=new AC();
      stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false},video:false});
      if(token!==ascentMic.token||scene!==SCENE.ASCEND||P4.beat===4){
        stream.getTracks().forEach(function(track){track.stop();});await audioContext.close();return;
      }
      audioContext.resume().catch(function(){});
      var analyser=audioContext.createAnalyser();analyser.fftSize=8192;
      var source=audioContext.createMediaStreamSource(stream);source.connect(analyser);
      ascentMic.stream=stream;ascentMic.context=audioContext;ascentMic.source=source;
      ascentMic.analyser=analyser;ascentMic.samples=new Float32Array(analyser.fftSize);
      ascentMic.status='ready';button.textContent='拍手终闪：开';button.setAttribute('aria-pressed','true');
      button.hidden=audioContext.state==='running';
      ascentMic.noise=.005;ascentMic.previous=0;ascentMic.previousPeak=0;ascentMic.lastClap=-10;
      ascentMic.calibratedUntil=performance.now()/1000+.65;ascentMic.feedbackUntil=0;
      document.getElementById('mic-feedback').hidden=false;
    }catch(error){
      if(stream)stream.getTracks().forEach(function(track){track.stop();});
      if(audioContext)audioContext.close().catch(function(){});
      if(token===ascentMic.token){ascentMic.status='error';button.hidden=false;button.textContent='麦克风未授权 · 重试';}
    }
  }
  function detectClapTransient(samples,state,now) {
    var sum=0,peak=0;
    for(var i=0;i<samples.length;i++){
      var value=samples[i];sum+=value*value;peak=Math.max(peak,Math.abs(value));
    }
    var rms=Math.sqrt(sum/samples.length),calibrating=now<state.calibratedUntil;
    var candidate=peak>Math.max(.10,state.noise*5)&&rms>Math.max(.008,state.noise*1.8);
    var rising=peak>state.previousPeak*1.22||rms-state.previous>.004;
    var detected=!calibrating&&candidate&&rising&&now-state.lastClap>1.3;
    if(calibrating||!candidate)state.noise=lerp(state.noise,rms,calibrating?.15:.035);
    state.noise=clamp(state.noise,.002,.09);state.previous=rms;state.previousPeak=peak;
    state.level=peak;if(detected)state.lastClap=now;
    return detected;
  }
  function sampleAscensionMic() {
    if(ascentMic.status!=='ready'||!ascentMic.analyser)return;
    var feedback=document.getElementById('mic-feedback'),now=performance.now()/1000;
    if(ascentMic.context.state!=='running'){
      feedback.textContent='浏览器暂停了麦克风音频，需点击恢复';document.getElementById('ascension-mic').hidden=false;return;
    }
    ascentMic.analyser.getFloatTimeDomainData(ascentMic.samples);
    if(detectClapTransient(ascentMic.samples,ascentMic,now)){
      ascentMic.feedbackUntil=now+1.5;
      if(P4.beat<=2){
        P4.clapAge=0;
        spirits.forEach(function(s){
          if(s.ascended)return;
          var angle=Math.atan2((s.wy-P4.nest.y)/.24,s.wx-P4.nest.x);
          s.wvx+=Math.cos(angle)*100;if(s.ascendWave==null)s.wvy+=Math.sin(angle)*24;
          s.flash=Math.max(s.flash,.8);
        });
      }
      if(P4.beat===3&&P4.beatClock>.3)P4.pendingClapUntil=now+2;
    }
    if(now<ascentMic.calibratedUntil)feedback.textContent='正在适应环境声，请稍等片刻';
    else if(now<ascentMic.feedbackUntil)feedback.textContent=P4.beat===3?'已识别拍手，正在点亮海面':'已识别拍手 · 完成四波升腾后可触发终闪';
    else feedback.textContent='音量 '+Math.round(Math.min(1,ascentMic.level)*100)+'% · '+(P4.beat===3?'拍手终闪已就绪':'等待四波升腾完成');
  }

  function updatePhase1(dt, nowS) {
    P1.beatClock += dt;
    P1.orbitRot += dt * 0.22;                  // 群体常态环流缓速
    var tp = phase1Target();
    for (var i = 0; i < spirits.length; i++) {
      var s = spirits[i];
      if (s.mode === "hero" && s.heroState) updateHeroSpirit(s, dt, nowS, tp);
      else updateFlockSpirit(s, dt, nowS, tp);
    }
    if (P1.beat === 2) updateBeat2(dt, tp);
    else if (P1.beat === 3) updateBeat3(dt);
  }

  /* ---------- 角落极简手势图标（无文字教学，方案 4.3） ---------- */
  function drawGestureIcon(nowS) {
    var icon = scene === SCENE.HERD ? P2.icon : P1.icon;
    if (!icon) return;
    var x = 44, y = H - 56, r = 13;
    var pulse = 0.28 + 0.16 * Math.sin(nowS * 3);
    ctx.save();
    ctx.strokeStyle = "rgba(191, 217, 232," + pulse.toFixed(3) + ")";
    ctx.fillStyle = "rgba(191, 217, 232," + pulse.toFixed(3) + ")";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    if (icon === "gather") {
      for (var i = -2; i <= 2; i++) {          // 张开的手：五指放射 + 掌弧
        var a = -Math.PI / 2 + i * 0.38;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * 5.5, y + Math.sin(a) * 5.5);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y + 4.5, 5, 0, Math.PI); ctx.stroke();
    } else if (icon === "pinch") {
      // 捏合：拇指与食指两弧相对（掠食者教学）
      var gap2 = 4 + Math.sin(nowS * 3) * 1.5;               // 一开一合的提示动效
      ctx.beginPath(); ctx.arc(x - gap2, y, 5, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + gap2, y, 5, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();  // 握拳：实心点
    }
    ctx.restore();
  }

  /* ============================================
     手势识别（MediaPipe GestureRecognizer · CDN 库引用）

     运行时通过 CDN 动态 import 引入（库引用不占三文件约束，方案 7.2），
     模型文件 gesture_recognizer.task 为本地数据文件，与三文件并列放置。
     多 CDN 依次回退，防演示现场单一 CDN 被墙/抽风。

     捏合判定（方案 4.1 / 4.2）：
       距离比 = 拇指尖(4)与食指尖(8)距离 ÷ 手尺度（腕0 → 中指根9），尺度无关；
       双阈值迟滞——进入 < 0.32、退出 > 0.48，临界不抖动；
       保持 ≥ 0.22 秒才触发一次"捏合"意图，松开后才可再次触发。
     光晕光标（方案 4.3）：
       掌心 = 腕(0)与四指根(5/9/13/17)均值；前置摄像头镜像翻转 x（方案 8.3）；
       EMA 平滑，速度快时弱平滑、慢时强平滑（方案 4.2）。
     ============================================ */
  var MP_VERSION = "0.10.14";
  var MP_CDNS = [
    "https://unpkg.com/@mediapipe/tasks-vision@" + MP_VERSION,
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION
  ];
  var hand = {
    status: "idle",        // idle | loading | ready | error
    recognizer: null,
    video: null,
    lastDetectAt: 0,       // 上次检测时刻（毫秒，用于节流）
    lastSeenAt: -10,       // 上次看到手的时刻（秒，真实时钟）
    present: false,        // 当前是否有手在画面中
    category: "Neutral",   // 分类器稳定输出（Gather/Disperse/…）
    catPending: "Neutral", // 类别稳定滤波的候选值
    catCount: 0,
    debugCategory: null,   // 调试注入的手势类别（__abyss.setCategory）
    debugLock: false,      // 调试锁定：合成注入接管，忽略真实检测结果（__abyss.lock）
    cursor: { x: 0, y: 0, alpha: 0, seen: false, speed: 0, px: 0, py: 0 },
    pinch: { active: false, since: 0, ratio: 1, fired: false }
  };
  var PINCH_ENTER = 0.32;      // 捏合进入阈值（距离比）
  var PINCH_EXIT = 0.48;       // 捏合退出阈值（迟滞）
  var PINCH_HOLD = 0.22;       // 捏合保持时长（秒）
  var DETECT_INTERVAL = 66;    // 检测节流 ~15fps（方案 7.5），渲染层平滑补足流畅度
  var HAND_LOST_AFTER = 0.25;  // 手消失判定宽限（秒），避免单帧丢失就打断捏合

  // 依次尝试各 CDN，返回第一个可用的 MediaPipe vision 模块与 wasm 文件集
  function loadVision() {
    var chain = Promise.reject();
    MP_CDNS.forEach(function (base) {
      chain = chain.catch(function () {
        return import(base + "/vision_bundle.mjs").then(function (vision) {
          return vision.FilesetResolver.forVisionTasks(base + "/wasm").then(function (fileset) {
            return { vision: vision, fileset: fileset };
          });
        });
      });
    });
    return chain;
  }

  function initHandTracking() {
    if (hand.status !== "idle") return;
    hand.status = "loading";
    (async function () {
      var mp = await loadVision();
      var vision = mp.vision, fileset = mp.fileset;

      // 优先 GPU，失败自动回退 CPU（老机器 / 无显卡环境）
      var options = {
        runningMode: "VIDEO",
        numHands: 1              // 开场仪式单手即可；阶段三双手分群时再调 2
      };
      try {
        hand.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, Object.assign({
          baseOptions: { modelAssetPath: "gesture_recognizer.task", delegate: "GPU" }
        }, options));
      } catch (e) {
        hand.recognizer = await vision.GestureRecognizer.createFromOptions(fileset, Object.assign({
          baseOptions: { modelAssetPath: "gesture_recognizer.task" }
        }, options));
      }

      // 低分辨率检测流 320×240（方案 7.3）
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
        audio: false
      });
      var v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      await v.play();
      hand.video = v;
      hand.status = "ready";
      document.getElementById("camera-status").hidden = true;
    })().catch(function (err) {
      hand.status = "error";
      document.getElementById("camera-message").textContent = "摄像头启动未完成：" + err.name + " · " + err.message;
      document.getElementById("camera-retry").hidden = false;
      document.getElementById("camera-status").hidden = false;
      console.warn("手势识别不可用，降级为点击点亮：", err);
      if (hintEl) hintEl.textContent = "摄像头不可用 · 点击画面点亮火种";
    });
  }

  // 每帧调用（内部节流）：把视频帧喂给识别器
  function detectHand(nowMs) {
    if (hand.status !== "ready") return;
    if (hand.debugLock) return;   // 【临时调试】合成注入接管期间忽略真实检测结果
    var v = hand.video;
    if (!v || v.readyState < 2 || v.videoWidth === 0) return;
    if (nowMs - hand.lastDetectAt < DETECT_INTERVAL) return;
    hand.lastDetectAt = nowMs;

    var res;
    try {
      res = hand.recognizer.recognizeForVideo(v, Math.round(nowMs));
    } catch (e) { return; }

    if (res.landmarks && res.landmarks.length > 0) {
      var primary=0;
      if((scene===SCENE.BLOOM||scene===SCENE.ASCEND) && res.landmarks.length>1 && hand.cursor.seen){
        var distances=res.landmarks.map(function(lm){
          var x=0,y=0;[0,5,9,13,17].forEach(function(i){x+=lm[i].x;y+=lm[i].y;});
          return Math.hypot((1-x/5)*W-hand.cursor.x,y/5*H-hand.cursor.y);
        });
        if(distances[1]<distances[0])primary=1;
      }
      if (res.gestures && res.gestures[primary] && res.gestures[primary][0]) {
        // 类别稳定滤波：连续 2 次一致才采纳，防止单帧跳变（方案 4.2 防抖）
        var cat = res.gestures[primary][0].categoryName;         // Gather / Disperse / …
        if (cat === hand.catPending) hand.catCount++;
        else { hand.catPending = cat; hand.catCount = 1; }
        if (hand.catCount >= 2) hand.category = cat;
      }
      processLandmarks(res.landmarks[primary], nowMs / 1000);
      hand.secondary=null;
      if((scene===SCENE.BLOOM||scene===SCENE.ASCEND) && res.landmarks[1]){
        var second=res.landmarks[1-primary],sx=0,sy=0;
        [0,5,9,13,17].forEach(function(i){sx+=second[i].x;sy+=second[i].y;});
        hand.secondary={x:(1-sx/5)*W,y:sy/5*H,at:nowMs/1000};
      }
    }
    // （手离开的清理由 tick 按真实时钟统一执行，真实/合成注入一致）
  }

  // 节拍层读取当前手势意图：调试注入优先，其次分类器稳定输出
  function currentGesture() {
    if (hand.debugCategory) return hand.debugCategory;
    return hand.present ? hand.category : "Neutral";
  }

  function normalizeBloomGesture(category) {
    if(category==='Gather'||category==='Open_Palm')return 'Gather';
    if(category==='Disperse'||category==='Closed_Fist')return 'Disperse';
    return 'Neutral';
  }
  function palmGestureFromLandmarks(lm) {
    if(!lm||lm.length<21)return 'Neutral';
    function distance(a,b){return Math.hypot(lm[a].x-lm[b].x,lm[a].y-lm[b].y,(lm[a].z||0)-(lm[b].z||0));}
    var open=0,closed=0;
    // 不依赖拇指位置，左右手、旋转手掌均使用指尖到腕部的相对距离。
    [[5,6,8],[9,10,12],[13,14,16],[17,18,20]].forEach(function(f){
      var tip=distance(f[2],0),joint=distance(f[1],0);
      if(tip>joint*1.16&&distance(f[2],f[0])>distance(f[1],f[0])*1.35)open++;
      else if(tip<joint*1.08)closed++;
    });
    return open>=3?'Gather':closed>=3?'Disperse':'Neutral';
  }
  function bloomGesture() {
    if(hand.debugCategory)return normalizeBloomGesture(hand.debugCategory);
    if(!hand.present)return 'Neutral';
    if(hand.poseCount>=2&&performance.now()/1000-hand.poseAt<.25&&hand.poseGesture!=='Neutral')return hand.poseGesture;
    return normalizeBloomGesture(hand.category);
  }

  // 关键点处理：光晕光标跟随 + 捏合状态机（真实检测与调试注入共用）
  function processLandmarks(lm, nowS) {
    hand.present = true;
    hand.lastSeenAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    var pose=palmGestureFromLandmarks(lm);
    hand.poseCount=pose===hand.poseGesture&&hand.lastSeenAt-(hand.poseAt||0)<.25?(hand.poseCount||0)+1:1;
    hand.poseGesture=pose;hand.poseAt=hand.lastSeenAt;

    // 掌心位置（镜像翻转），EMA 平滑
    var px = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
    var py = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;
    var tx = (1 - px) * W;
    var ty = py * H;
    var c = hand.cursor;
    if (!c.seen) { c.x = tx; c.y = ty; c.seen = true; }
    var dx = tx - c.x, dy = ty - c.y;
    var k = Math.sqrt(dx * dx + dy * dy) > 60 ? 0.55 : 0.30;   // 快动作弱平滑
    c.x += dx * k;
    c.y += dy * k;
    c.alpha = Math.min(c.alpha + 0.08, 1);

    // 捏合距离比（尺度无关）
    var scale = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
    var ratio = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) / scale;
    var p = hand.pinch;
    p.ratio = ratio;
    if (!p.active && ratio < PINCH_ENTER) {
      p.active = true;
      p.since = nowS;
      p.fired = false;
    } else if (p.active && ratio > PINCH_EXIT) {
      p.active = false;
    }
    // 保持足够时长 → 触发一次捏合意图（本节拍用于点亮火种）
    if (p.active && !p.fired && nowS - p.since >= PINCH_HOLD) {
      p.fired = true;
      onPinch();
    }
  }

  var pendingIgnite = false;   // 下潜期间的捏合先记一笔，进入仪式场景即补点亮

  function onPinch() {
    if (scene === SCENE.RITUAL) ignite();
    else if (scene === SCENE.DIVING) pendingIgnite = true;
    // 后续节拍在这里扩展：捏合收缩避险 / 捏合蓄力弹出诱饵光球
  }

  /* 光晕光标绘制：手 = 一团呼吸的光晕；捏合时收缩变暖，并显示保持进度弧。
     阶段一/二中不绘制——火种已直接成为掌心光晕（drawEmberLayer 承担）。 */
  function drawHandCursor(nowS) {
    if (scene === SCENE.AWAKEN || scene === SCENE.HERD || scene === SCENE.BLOOM || scene===SCENE.ASCEND) return;
    var c = hand.cursor;
    if (c.alpha < 0.02) return;
    var pinching = hand.pinch.active;
    var breathe = 0.5 + 0.5 * Math.sin(nowS * 2.2);
    var r = Math.min(W, H) * (pinching ? 0.026 : 0.042) * (0.92 + 0.08 * breathe);
    var a = c.alpha * (pinching ? 0.5 : 0.3);
    var col = pinching ? "255, 243, 214" : "190, 220, 248";   // 捏合时由冷转暖（即时确认）

    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r * 2.2);
    g.addColorStop(0, "rgba(" + col + "," + a.toFixed(3) + ")");
    g.addColorStop(0.4, "rgba(" + col + "," + (a * 0.35).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + col + ",0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(" + col + "," + Math.min(a * 1.6, 1).toFixed(3) + ")";
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * 0.32, 0, Math.PI * 2);
    ctx.fill();

    // 捏合保持进度弧：转满一圈即触发
    if (pinching) {
      var prog = clamp((nowS - hand.pinch.since) / PINCH_HOLD, 0, 1);
      ctx.strokeStyle = "rgba(255, 243, 214," + (0.75 * c.alpha).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 1.15, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ============================================
     场景推进
     ============================================ */
  var diveBtn = document.getElementById("dive-btn");
  var screenEl = document.querySelector(".screen");
  var hintEl = document.getElementById("pinch-hint");
  var hintShown = false;

  function startDive() {
    if (scene !== SCENE.TITLE) return;
    prepareBloomAudio();
    Journey.startedAt=performance.now()/1000;
    screenEl.classList.remove('returning');
    scene = SCENE.DIVING;
    sceneClock = 0;
    screenEl.classList.add("leaving");           // 标题组上飘淡出（CSS 动画）
    setTimeout(function () { screenEl.style.display = "none"; }, 2000);
    initHandTracking();                          // 借这次点击申请摄像头并加载模型（下潜的 3.4s 正好完成初始化）
  }

  function enterRitual() {
    scene = SCENE.RITUAL;
    sceneClock = 0;
    ember.alpha = 1;
    ember.gutterAt = 3.5 + Math.random() * 2;
    if (pendingIgnite) { pendingIgnite = false; ignite(); }   // 补点：下潜中已捏合
  }

  // 点亮（正式版由捏合手势触发；当前为调试点击触发）
  function ignite() {
    if (scene !== SCENE.RITUAL) return;
    scene = SCENE.IGNITING;
    sceneClock = 0;
    ember.lit = true;
    ember.sparks.length = 0;
    spawnIgniteBurst(emberPos());
    if (hintEl) hintEl.classList.remove("show");
  }

  // 调试重置：回到标题页
  function resetAll() {
    var wasEnding=scene===SCENE.ASCEND;
    stopAscensionMic();resetPhase4();Journey={startedAt:0,woken:0,completedAt:0};
    scene = SCENE.TITLE;
    sceneClock = 0;
    riseBias = 0;
    overlayA = 0;
    trailMode = false;
    morphT = 0;
    ember.alpha = 0;
    ember.lit = false;
    ember.gutterT = -1;
    ember.scale = 1;
    ember.x = W / 2;
    ember.y = H * 0.47;
    ember.speed = 0;
    ember.sparks.length = 0;
    ember.rings.length = 0;
    ember.burst.length = 0;
    // 阶段一状态复位
    spirits.length = 0;
    heroSpirit = null;
    P1.beat = 0;
    P1.beatClock = 0;
    P1.orbitRot = 0;
    P1.speedBoost = 0;
    P1.gatherHold = 0;
    P1.wakeTimer = 0;
    P1.scatterCd = 0;
    P1.icon = null;
    P1.groupOrbitAcc = 0;
    P1.groupOrbitDone = false;
    resonanceFlash = 0;
    hand.debugCategory = null;
    pendingIgnite = false;
    // 阶段二状态复位，保留已解码纹理以便再次游玩。
    resetPhase2();resetPhase3();hand.secondary=null;
    document.getElementById("journey-status").hidden=true;
    document.getElementById('journey-message').textContent='旅程素材尚未加载完成，光群会在原处等候。';
    if(hand.recognizer)Promise.resolve(hand.recognizer.setOptions({numHands:1})).catch(function(){});
    // 沉睡光点补满（节拍 2 唤醒会消耗粒子）
    particles.length = 0;
    resize();
    hintShown = false;
    if (hintEl) hintEl.classList.remove("show");
    screenEl.classList.remove("leaving");
    screenEl.classList.toggle('returning',wasEnding);
    screenEl.style.display = "";
  }

  function updateDiving() {
    var p = clamp(sceneClock / DIVE_DURATION, 0, 1);
    var e = easeInOutCubic(p);
    overlayA = e * 0.94;                                  // 沉入近黑蓝
    riseBias = easeInCubic(clamp(p * 1.6, 0, 1)) * 170;   // 粒子上浮加速
    ember.alpha = clamp((sceneClock - EMBER_FADEIN_AT) / (DIVE_DURATION - EMBER_FADEIN_AT), 0, 1);
    if (p >= 1) enterRitual();
  }

  function updateRitual(dt) {
    // 上浮速度缓回 0，光点归于静谧（沉睡的光点）
    riseBias += (0 - riseBias) * Math.min(dt * 2, 1);
    // 1.4s 后显示捏合提示（开发期教学提示，接入手势后可删）
    if (!hintShown && sceneClock > 1.4 && hintEl) {
      hintEl.classList.add("show");
      hintShown = true;
    }
  }

  function updateIgniting() {
    if (sceneClock >= IGNITE_DURATION) {
      scene = SCENE.IGNITED;
      sceneClock = 0;
    }
  }

  /* ============================================
     主循环
     ============================================ */
  var last = 0;

  function tick(now) {
    var dt = Math.min((now - last) / 1000, 0.05) * TIME_SCALE;
    last = now;
    sceneClock += dt;
    var nowS = now / 1000;

    if (scene === SCENE.DIVING) updateDiving();
    else if (scene === SCENE.RITUAL) updateRitual(dt);
    else if (scene === SCENE.IGNITING) updateIgniting();
    else if (scene === SCENE.IGNITED) {
      if (sceneClock > BEAT1_DELAY) startBeat1();     // 点亮稍歇，第一只光灵登场
    }
    else if (scene === SCENE.AWAKEN) updatePhase1(dt, nowS);
    else if (scene === SCENE.HERD) updatePhase2(dt, nowS);
    else if (scene === SCENE.BLOOM) updatePhase3(dt, nowS);
    else if(scene===SCENE.ASCEND)updatePhase4(dt);

    updateEmberLife(dt);   // 火种生命周期：缩小成灯芯 / 掌晕跟手与归中

    /* 渲染管线：主画布每帧清屏（环境层锐利、无残影），发光体画在离屏拖尾层
       （黑底 + 低透明黑覆盖衰减成光带 + 随流速横向偏移），最后 'lighter' 合成。
       背景粒子与环境不再参与拖尾累积 —— 消除雨丝残痕与灰雾。 */
    if (trailMode) {
      var shift = scene===SCENE.ASCEND?P4.frameShift:scene === SCENE.BLOOM ? P3.frameShift : scene === SCENE.HERD ? P2.frameShift : { x: 0, y: 0 };
      if (Math.abs(shift.x) + Math.abs(shift.y) > .01) {
        tctx.drawImage(trailCv, 0, 0, trailCv.width, trailCv.height, shift.x, shift.y, W, H);
      }
      tctx.fillStyle = scene===SCENE.ASCEND?'rgba(0,0,0,.11)':"rgba(0, 0, 0, 0.14)";
      tctx.fillRect(0, 0, W, H);
    } else {
      tctx.clearRect(0, 0, W, H);
    }

    ctx = ctx0;
    ctx.clearRect(0, 0, W, H);                  // 标题页保持透明（露出 CSS 深海渐变）
    if (trailMode) {                            // 拖尾场景铺当前阶段底色
      var bgc = bgColor();
      ctx.fillStyle = "rgb(" + Math.round(bgc[0]) + "," + Math.round(bgc[1]) + "," + Math.round(bgc[2]) + ")";
      ctx.fillRect(0, 0, W, H);
    }

    // 牵引中心平滑跟随（标题页）
    if (mouse.active && scene === SCENE.TITLE) {
      mouse.x += (mouse.tx - mouse.x) * Math.min(dt * 6, 1);
      mouse.y += (mouse.ty - mouse.y) * Math.min(dt * 6, 1);
    }

    // 远景礁石海沟剪影（最底层视差，方案 5.5）
    drawFarReefs();
    drawBloomEnvironment();
    drawAscensionEnvironment();

    // 粒子层（沉睡光点 = 中景尘埃；阶段一中被逐个唤醒转化为光灵；
    // 阶段二随世界流速视差滚动，提供空间纵深参照）
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var sway = (now / p.driftPeriod) * Math.PI * 2 + p.driftPhase;
      p.x += (p.vx + Math.cos(sway) * 3.0 - P2.scrollVX * p2Unit() * 0.45 * morphT) * dt;
      p.y += (p.vy - riseBias + Math.sin(sway) * 2.4) * dt + (scene === SCENE.HERD ? P2.frameShift.y * .45 : 0);

      if (mouse.active && scene === SCENE.TITLE) {
        var dx = mouse.x - p.x;
        var dy = mouse.y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1 && dist < GATHER_RADIUS) {
          var pull = GATHER_PULL * (1 - dist / GATHER_RADIUS);
          pull *= pull / GATHER_PULL;
          p.x += (dx / dist) * pull * dt;
          p.y += (dy / dist) * pull * dt;
        }
      }

      if (p.x < -8) p.x = W + 8; else if (p.x > W + 8) p.x = -8;
      if (p.y < -8) p.y = H + 8; else if (p.y > H + 8) p.y = -8;

      drawParticle(p, now);
    }

    // 深渊色覆盖层（仅转场期间；拖尾模式下底色由覆盖法收敛）
    if (!trailMode && overlayA > 0.001) {
      ctx.fillStyle = rgbaStr(bgColor(), overlayA);
      ctx.fillRect(0, 0, W, H);
    }

    // 礁石实体与掠食者阴影（环境层，主画布锐利绘制）
    drawShadow();  // 黑影在岩壁后、水道内掠过。
    drawReefs(nowS);
    drawP2Layer(3);  // 少量前景也在环境层，避免遮盖原光灵亮芯与拖尾。

    drawBloomEffects(nowS);
    drawAscensionEffects();

    // ===== 发光体层：切换到拖尾离屏层绘制（加色发光累积成光带） =====
    ctx = tctx;

    // 光灵层（加色发光）
    if (spirits.length > 0) {
      ctx.globalCompositeOperation = "lighter";
      for (var si = 0; si < spirits.length; si++) drawSpirit(spirits[si], nowS);
      ctx.globalCompositeOperation = "source-over";
    }

    // 火种层
    if (ember.alpha > 0.001) drawEmberLayer(nowS, dt);

    // 诱饵光球（最上层发光体）
    drawLure(nowS);

    // 首次共鸣：全屏冷白径向闪光（自牵引目标扩散）
    if (resonanceFlash > 0.01) {
      var tp0 = phase1Target();
      var fr0 = Math.max(W, H) * 0.8;
      var fg0 = ctx.createRadialGradient(tp0.x, tp0.y, 0, tp0.x, tp0.y, fr0);
      fg0.addColorStop(0, "rgba(232, 244, 255," + (resonanceFlash * 0.4).toFixed(3) + ")");
      fg0.addColorStop(1, "rgba(232, 244, 255, 0)");
      ctx.fillStyle = fg0;
      ctx.fillRect(0, 0, W, H);
      resonanceFlash = Math.max(resonanceFlash - dt * 0.7, 0);
    }

    // 光晕光标层（手部位置的角色化表达）
    drawHandCursor(nowS);

    // 拖尾层合成回主画布（黑底加色：只叠加光，不改变底色与环境）
    ctx = ctx0;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(trailCv, 0, 0, trailCv.width, trailCv.height, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // 角落极简手势图标（节拍 2 教学提示；阶段二掠食者捏合教学）
    drawPredatorWarning();
    drawAscensionFinalOverlay();
    if (scene === SCENE.AWAKEN || scene === SCENE.HERD) drawGestureIcon(nowS);

    // 手势检测（内部节流 ~15fps）
    detectHand(now);

    // 分群时适当容忍双手模式的检测间隔；其他场景仍使用原有宽限。
    var lostAfter=(scene===SCENE.BLOOM&&P3.beat===2)||scene===SCENE.ASCEND ? .45 : HAND_LOST_AFTER;
    if (hand.present && now / 1000 - hand.lastSeenAt > lostAfter) {
      hand.present = false;
      hand.pinch.active = false;
      hand.pinch.fired = false;
      hand.category = "Neutral";
    }

    // 手不在画面时，光晕光标淡出；光标速度跟踪（受惊判定用）
    var hc = hand.cursor;
    if (!hand.present && hc.alpha > 0) hc.alpha = Math.max(hc.alpha - dt * 1.5, 0);
    var instV = dt > 0 ? Math.hypot(hc.x - hc.px, hc.y - hc.py) / dt : 0;
    hc.speed = lerp(hc.speed || 0, Math.min(instV, 3000), 0.25);
    hc.px = hc.x;
    hc.py = hc.y;

    requestAnimationFrame(tick);
  }

  function drawParticle(p, now) {
    var wave = 0.5 + 0.5 * Math.sin((now / p.period) * Math.PI * 2 + p.phase);
    var alpha = p.baseAlpha * (0.25 + 0.75 * wave);
    // 渲染管线拆分后背景光尘不再留拖尾，恢复全亮度（深海微光氛围）

    if (p.isBlue) {
      var haloR = p.radius * 4.5;
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
      g.addColorStop(0, "rgba(150, 205, 245," + (alpha * 0.28).toFixed(3) + ")");
      g.addColorStop(0.4, "rgba(150, 205, 245," + (alpha * 0.09).toFixed(3) + ")");
      g.addColorStop(1, "rgba(150, 205, 245, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(190, 225, 250," + alpha.toFixed(3) + ")";
    } else {
      ctx.fillStyle = "rgba(226, 238, 250," + alpha.toFixed(3) + ")";
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ============================================
     事件
     ============================================ */
  window.addEventListener("resize", resize);

  window.addEventListener("mousemove", function (e) {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    if (!mouse.active) {
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
      mouse.active = true;
    }
  });
  document.addEventListener("mouseleave", function () { mouse.active = false; });

  document.getElementById("camera-retry").addEventListener("click", function (event) {
    event.stopPropagation();
    if (hand.status !== "error") return;
    if (hand.recognizer) { try { hand.recognizer.close(); } catch (error) {} }
    hand.recognizer = null; hand.status = "idle";
    document.getElementById("camera-status").hidden = true;
    initHandTracking();
  });

  diveBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    startDive();
  });

  // 【临时调试】ritual 场景点击画面 = 模拟捏合点亮；R = 重置
  window.addEventListener("click", function () {
    if (scene === SCENE.RITUAL) ignite();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "r" || e.key === "R") resetAll();
  });

  /* 【临时调试】自动化测试用：注入合成关键点 / 查询内部状态。
     与真实识别共用 processLandmarks 处理管线，交付前可整体删除。 */
  document.getElementById("journey-retry").addEventListener("click",function(){
    prepareBloomAudio();bloomRuntimeError=null;
    if((scene===SCENE.BLOOM&&P3.beat===4)||scene===SCENE.ASCEND)initPhase4Art(true);
    else initPhase3Art();
    document.getElementById("journey-status").hidden=true;
  });
  document.getElementById("bloom-sound").addEventListener("click",function(){
    bloomAudioEnabled=!bloomAudioEnabled;if(bloomAudioEnabled)prepareBloomAudio();
    this.textContent=(scene===SCENE.BLOOM?'节拍声音：':'旅程声音：')+(bloomAudioEnabled?'开':'关');
    this.setAttribute("aria-pressed",String(bloomAudioEnabled));
  });
  document.getElementById('ascension-mic').addEventListener('click',enableAscensionMic);
  document.getElementById('ending-replay').addEventListener('click',resetAll);
  window.addEventListener('pagehide',stopAscensionMic);
  window.__abyss = {
    hand: hand,
    scene: function () { return scene; },
    beat: function () { return P1.beat; },
    spirits: function () { return spirits.length; },
    hero: function () { return heroSpirit && heroSpirit.heroState ? heroSpirit.heroState.name : null; },
    ember: function () { return { scale: ember.scale, alpha: ember.alpha, x: ember.x, y: ember.y }; },
    morph: function () { return morphT; },
    p2: function () {
      return { beat: P2.beat, route: P2.route ? "narrow" : "wide", routeLocked: P2.routeLocked,
        progress: P2.progress, gaps: P2.passedGaps, dust: P2.dustBonus,
        leader: P2.leader && { x: P2.leader.x, y: P2.leader.y },
        camera: { x: P2.camera.x, y: P2.camera.y }, blocked: P2.blocked,
        shadows: P2.shadowCount, shadowPass: P2.shadow ? P2.shadow.pass : 0,
        assetsReady: P2Art.ready, assetsFailed: P2Art.failed,
        spriteCount: Object.keys(P2Art.images).length, world: P2_CHANNEL_LAYOUT.world,
        dustByRoute: [0, 1].map(function (ri) { return P2.dust.filter(function (d) { return d.route === ri && !d.taken; }).length; }),
        motion: "free-swimming", shadowInChannel: !!P2.shadow && P2.beat === 2 };
    },
    inject: function (lm, tSec, category) {
      if (category) hand.debugCategory = category;
      processLandmarks(lm, tSec == null ? performance.now() / 1000 : tSec);
    },
    setCategory: function (c) { hand.debugCategory = c; },
    lock: function (v) { hand.debugLock = !!v; },
    setTimeScale: function (k) { TIME_SCALE = clamp(k, 0, 12); },
    p3: function(){return {beat:P3.beat,collected:P3.collected,mixed:P3.mixed,split:P3.split,
      vortex:P3.vortex,rhythmHits:P3.rhythmHits,complete:P3.complete,target:P3.target,
      count:spirits.length,clock:P3.clock,blend:bloomMix,assetsReady:P3Art.ready,
      p5Ready:!!bloomP5,p5Drawn:!!bloomFx,leader:{x:P3.leader.x,y:P3.leader.y},
      camera:{x:P3.camera.x,y:P3.camera.y},colors:spirits.map(function(s){return s.bloomColor;}),
      dustCount:P3.dust.length,version:7,feedClock:P3.feedClock,feedDuration:P3.feedDuration,limit:P3.limit,feedGoal:P3.feedGoal,feedBirths:P3.feedBirths,startCount:P3.startCount,budget:P3.budget.slice(),
      pending:P3.births.reduce(function(sum,b){return sum+b.remaining;},0),
      nurseries:P3.nurseries.map(function(n){var q=bloomScreen(n.x,n.y);return {x:n.x,y:n.y,sx:q.x,sy:q.y,dust:n.dust,energy:n.energy,state:n.state,assist:n.assist};}),
      seeds:P3.seeds.map(function(s){return {mature:s.mature,progress:s.progress};}),
      separation:P3.separation||0,separated:P3.separated,mergeStyle:P3.mergeStyle,
      splitReady:P3.splitReady,splitMode:P3.splitMode,splitHold:P3.splitHold,
      splitAnchor:P3.splitAnchor&&{x:P3.splitAnchor.x,y:P3.splitAnchor.y},
      fusion:P3.fusion&&{style:P3.fusion.style,age:P3.fusion.age},
      rhythm:P3.rhythm&&{time:P3.rhythm.time,index:P3.rhythm.index,phrase:P3.rhythm.phrase,assist:P3.rhythm.assist,
        steps:P3.rhythm.steps,edges:P3.rhythm.assistEdges,failed:P3.rhythm.failed,intro:P3.rhythm.intro,cooldown:P3.rhythm.cooldown}};},
    bloomBodies: function(){return spirits.map(function(s){return {x:s.wx,y:s.wy};});},
    p4:function(){return {beat:P4.beat,blend:P4.blend,charge:P4.charge,waves:P4.waves,
      armed:P4.armed,ascent:P4.ascent,finalHold:P4.finalHold,surface:P4.surface,
      count:spirits.length,departed:spirits.filter(function(s){return s.ascended;}).length,
      waiting:spirits.filter(function(s){return s.ascendWave==null;}).length,
      assetsReady:P4Art.ready,assetsError:P4Art.error&&String(P4Art.error),
      p5Drawn:!!bloomFx,microphone:ascentMic.status,finishReason:P4.finishReason,stats:P4.stats,
      camera:{x:P4.camera.x,y:P4.camera.y},nest:{x:P4.nest.x,y:P4.nest.y}};},
    previewPhase4:function(){this.previewPhase3();P2.previewAscension=true;initPhase4Art();},
    previewPhase3: function(){
      this.previewPhase2("wide");P2.progress=1;P2.travel=5100;P2.leader.x=5100;
      P2.leader.y=p2RouteAt(4800).y;setHerdBeat(4);initPhase3Art();
    },
    // 开发预览：不申请摄像头、不改变正式开场路径。
    previewPhase2: function (route) {
      resetAll(); screenEl.style.display = "none";
      trailMode = true; ember.lit = true; ember.alpha = 1; ember.scale = .45;
      for (var i = 0; i < 24; i++) {
        var s = makeSpirit(W / 2 + rand(-80, 30) * p2Unit(), H * .47 + rand(-55, 55) * p2Unit());
        s.bornT = 2; spirits.push(s);
      }
      enterHerd();
      P2.preview = true; P2.route = route === "narrow" ? 1 : 0;
    }
  };

  /* 阶段二美术：共享 assets/images/ 素材，横竖屏使用相同图片与路线数据。 */
  var P2_CHANNEL_LAYOUT = {"version":3,"world":{"width":4800,"height":3200},"source":{"width":1536,"height":1024,"worldPerPixel":3.125},"routes":[{"id":"wide","name":"宽缝 · 回澜长廊","points":[{"x":0,"y":604.69,"top":440.63,"bottom":768.75,"safeRadius":125.96},{"x":12.5,"y":609.38,"top":446.88,"bottom":771.88,"safeRadius":124.32},{"x":25,"y":614.06,"top":456.25,"bottom":771.88,"safeRadius":125.18},{"x":37.5,"y":620.31,"top":468.75,"bottom":771.88,"safeRadius":125},{"x":50,"y":623.44,"top":471.88,"bottom":775,"safeRadius":124.57},{"x":62.5,"y":629.69,"top":475,"bottom":784.38,"safeRadius":123.71},{"x":75,"y":637.5,"top":471.88,"bottom":803.13,"safeRadius":122.86},{"x":87.5,"y":640.63,"top":465.63,"bottom":815.63,"safeRadius":124.5},{"x":100,"y":639.06,"top":459.38,"bottom":818.75,"safeRadius":128.64},{"x":112.5,"y":635.94,"top":453.13,"bottom":818.75,"safeRadius":135.28},{"x":125,"y":635.94,"top":450,"bottom":821.88,"safeRadius":139.42},{"x":137.5,"y":640.63,"top":450,"bottom":831.25,"safeRadius":141.07},{"x":150,"y":651.56,"top":450,"bottom":853.13,"safeRadius":135.21},{"x":162.5,"y":673.44,"top":450,"bottom":896.88,"safeRadius":123.74},{"x":175,"y":681.25,"top":450,"bottom":912.5,"safeRadius":126.24},{"x":187.5,"y":682.81,"top":450,"bottom":915.63,"safeRadius":133.31},{"x":200,"y":681.25,"top":450,"bottom":912.5,"safeRadius":141.32},{"x":212.5,"y":681.25,"top":450,"bottom":912.5,"safeRadius":145.46},{"x":225,"y":684.38,"top":453.13,"bottom":915.63,"safeRadius":147.1},{"x":237.5,"y":692.19,"top":459.38,"bottom":925,"safeRadius":143.74},{"x":250,"y":704.69,"top":471.88,"bottom":937.5,"safeRadius":137.89},{"x":262.5,"y":720.31,"top":484.38,"bottom":956.25,"safeRadius":136.85},{"x":275,"y":734.38,"top":493.75,"bottom":975,"safeRadius":142.28},{"x":287.5,"y":740.63,"top":496.88,"bottom":984.38,"safeRadius":150.21},{"x":300,"y":746.88,"top":500,"bottom":993.75,"safeRadius":158.14},{"x":312.5,"y":751.56,"top":503.13,"bottom":1000,"safeRadius":162.96},{"x":325,"y":760.94,"top":515.63,"bottom":1006.25,"safeRadius":159.6},{"x":337.5,"y":773.44,"top":534.38,"bottom":1012.5,"safeRadius":153.74},{"x":350,"y":784.38,"top":546.88,"bottom":1021.88,"safeRadius":150.39},{"x":362.5,"y":790.63,"top":550,"bottom":1031.25,"safeRadius":150.99},{"x":375,"y":795.31,"top":553.13,"bottom":1037.5,"safeRadius":154.53},{"x":387.5,"y":803.13,"top":562.5,"bottom":1043.75,"safeRadius":158.06},{"x":400,"y":809.38,"top":575,"bottom":1043.75,"safeRadius":165.13},{"x":412.5,"y":812.5,"top":578.13,"bottom":1046.88,"safeRadius":171.17},{"x":425,"y":814.06,"top":581.25,"bottom":1046.88,"safeRadius":171.24},{"x":437.5,"y":814.06,"top":578.13,"bottom":1050,"safeRadius":167.1},{"x":450,"y":814.06,"top":578.13,"bottom":1050,"safeRadius":162.96},{"x":462.5,"y":810.94,"top":571.88,"bottom":1050,"safeRadius":156.32},{"x":475,"y":809.38,"top":568.75,"bottom":1050,"safeRadius":149.68},{"x":487.5,"y":809.38,"top":568.75,"bottom":1050,"safeRadius":145.53},{"x":500,"y":814.06,"top":581.25,"bottom":1046.88,"safeRadius":146.39},{"x":512.5,"y":825,"top":606.25,"bottom":1043.75,"safeRadius":149.75},{"x":525,"y":843.75,"top":643.75,"bottom":1043.75,"safeRadius":160.61},{"x":537.5,"y":848.44,"top":653.13,"bottom":1043.75,"safeRadius":157.5},{"x":550,"y":850,"top":656.25,"bottom":1043.75,"safeRadius":157.5},{"x":562.5,"y":851.56,"top":656.25,"bottom":1046.88,"safeRadius":157.5},{"x":575,"y":848.44,"top":650,"bottom":1046.88,"safeRadius":155.56},{"x":587.5,"y":845.31,"top":643.75,"bottom":1046.88,"safeRadius":152.03},{"x":600,"y":835.94,"top":628.13,"bottom":1043.75,"safeRadius":155.39},{"x":612.5,"y":829.69,"top":621.88,"bottom":1037.5,"safeRadius":156.24},{"x":625,"y":820.31,"top":609.38,"bottom":1031.25,"safeRadius":155.71},{"x":637.5,"y":806.25,"top":587.5,"bottom":1025,"safeRadius":147.35},{"x":650,"y":776.56,"top":531.25,"bottom":1021.88,"safeRadius":128.99},{"x":662.5,"y":768.75,"top":518.75,"bottom":1018.75,"safeRadius":125.64},{"x":675,"y":764.06,"top":518.75,"bottom":1009.38,"safeRadius":127.28},{"x":687.5,"y":756.25,"top":512.5,"bottom":1000,"safeRadius":125.21},{"x":700,"y":746.88,"top":503.13,"bottom":990.63,"safeRadius":126.24},{"x":712.5,"y":731.25,"top":478.13,"bottom":984.38,"safeRadius":122.71},{"x":725,"y":714.06,"top":453.13,"bottom":975,"safeRadius":119.17},{"x":737.5,"y":703.13,"top":434.38,"bottom":971.88,"safeRadius":121.67},{"x":750,"y":695.31,"top":418.75,"bottom":971.88,"safeRadius":129.17},{"x":762.5,"y":690.63,"top":412.5,"bottom":968.75,"safeRadius":137.1},{"x":775,"y":687.5,"top":412.5,"bottom":962.5,"safeRadius":146.07},{"x":787.5,"y":678.13,"top":409.38,"bottom":946.88,"safeRadius":152.96},{"x":800,"y":670.31,"top":409.38,"bottom":931.25,"safeRadius":160.89},{"x":812.5,"y":660.94,"top":403.13,"bottom":918.75,"safeRadius":164.53},{"x":825,"y":653.13,"top":393.75,"bottom":912.5,"safeRadius":161.6},{"x":837.5,"y":640.63,"top":375,"bottom":906.25,"safeRadius":159.1},{"x":850,"y":631.25,"top":356.25,"bottom":906.25,"safeRadius":164.1},{"x":862.5,"y":625,"top":346.88,"bottom":903.13,"safeRadius":159.1},{"x":875,"y":618.75,"top":340.63,"bottom":896.88,"safeRadius":157.03},{"x":887.5,"y":609.38,"top":337.5,"bottom":881.25,"safeRadius":159.96},{"x":900,"y":600,"top":334.38,"bottom":865.63,"safeRadius":163.31},{"x":912.5,"y":595.31,"top":337.5,"bottom":853.13,"safeRadius":161.67},{"x":925,"y":589.06,"top":331.25,"bottom":846.88,"safeRadius":162.53},{"x":937.5,"y":582.81,"top":325,"bottom":840.63,"safeRadius":163.39},{"x":950,"y":578.13,"top":315.63,"bottom":840.63,"safeRadius":164.25},{"x":962.5,"y":573.44,"top":306.25,"bottom":840.63,"safeRadius":162.6},{"x":975,"y":570.31,"top":303.13,"bottom":837.5,"safeRadius":160.96},{"x":987.5,"y":567.19,"top":300,"bottom":834.38,"safeRadius":159.32},{"x":1000,"y":529.69,"top":296.88,"bottom":762.5,"safeRadius":185.18},{"x":1012.5,"y":525,"top":296.88,"bottom":753.13,"safeRadius":182.21},{"x":1025,"y":523.44,"top":296.88,"bottom":750,"safeRadius":172.21},{"x":1037.5,"y":523.44,"top":300,"bottom":746.88,"safeRadius":165.13},{"x":1050,"y":523.44,"top":300,"bottom":746.88,"safeRadius":158.06},{"x":1062.5,"y":523.44,"top":300,"bottom":746.88,"safeRadius":153.92},{"x":1075,"y":525,"top":306.25,"bottom":743.75,"safeRadius":149.78},{"x":1087.5,"y":525,"top":306.25,"bottom":743.75,"safeRadius":145.64},{"x":1100,"y":526.56,"top":309.38,"bottom":743.75,"safeRadius":143.99},{"x":1112.5,"y":528.13,"top":309.38,"bottom":746.88,"safeRadius":139.85},{"x":1125,"y":529.69,"top":309.38,"bottom":750,"safeRadius":131.75},{"x":1137.5,"y":534.38,"top":312.5,"bottom":756.25,"safeRadius":122.78},{"x":1150,"y":542.19,"top":321.88,"bottom":762.5,"safeRadius":115.89},{"x":1162.5,"y":554.69,"top":340.63,"bottom":768.75,"safeRadius":110.03},{"x":1175,"y":573.44,"top":371.88,"bottom":775,"safeRadius":109.6},{"x":1187.5,"y":585.94,"top":390.63,"bottom":781.25,"safeRadius":112.53},{"x":1200,"y":585.94,"top":384.38,"bottom":787.5,"safeRadius":108.39},{"x":1212.5,"y":576.56,"top":356.25,"bottom":796.88,"safeRadius":96.75},{"x":1225,"y":581.25,"top":353.13,"bottom":809.38,"safeRadius":95.1},{"x":1237.5,"y":593.75,"top":362.5,"bottom":825,"safeRadius":100.96},{"x":1250,"y":626.56,"top":425,"bottom":828.13,"safeRadius":124.32},{"x":1262.5,"y":651.56,"top":471.88,"bottom":831.25,"safeRadius":128.74},{"x":1275,"y":662.5,"top":487.5,"bottom":837.5,"safeRadius":127.1},{"x":1287.5,"y":670.31,"top":490.63,"bottom":850,"safeRadius":123.74},{"x":1300,"y":681.25,"top":484.38,"bottom":878.13,"safeRadius":121.67},{"x":1312.5,"y":681.25,"top":465.63,"bottom":896.88,"safeRadius":127.28},{"x":1325,"y":671.88,"top":440.63,"bottom":903.13,"safeRadius":139.35},{"x":1337.5,"y":665.63,"top":421.88,"bottom":909.38,"safeRadius":148.49},{"x":1350,"y":653.13,"top":390.63,"bottom":915.63,"safeRadius":153.49},{"x":1362.5,"y":645.31,"top":378.13,"bottom":912.5,"safeRadius":141.42},{"x":1375,"y":646.88,"top":384.38,"bottom":909.38,"safeRadius":133.31},{"x":1387.5,"y":650,"top":390.63,"bottom":909.38,"safeRadius":126.24},{"x":1400,"y":657.81,"top":396.88,"bottom":918.75,"safeRadius":124.5},{"x":1412.5,"y":665.63,"top":403.13,"bottom":928.13,"safeRadius":116.57},{"x":1425,"y":667.19,"top":406.25,"bottom":928.13,"safeRadius":107.6},{"x":1437.5,"y":675,"top":415.63,"bottom":934.38,"safeRadius":99.68},{"x":1450,"y":685.94,"top":431.25,"bottom":940.63,"safeRadius":93.82},{"x":1462.5,"y":701.56,"top":453.13,"bottom":950,"safeRadius":90.89},{"x":1475,"y":721.88,"top":490.63,"bottom":953.13,"safeRadius":98.99},{"x":1487.5,"y":743.75,"top":528.13,"bottom":959.38,"safeRadius":112.35},{"x":1500,"y":756.25,"top":546.88,"bottom":965.63,"safeRadius":118.21},{"x":1512.5,"y":764.06,"top":550,"bottom":978.13,"safeRadius":121.57},{"x":1525,"y":770.31,"top":556.25,"bottom":984.38,"safeRadius":122.43},{"x":1537.5,"y":804.69,"top":625,"bottom":984.38,"safeRadius":138.74},{"x":1550,"y":809.38,"top":634.38,"bottom":984.38,"safeRadius":140.39},{"x":1562.5,"y":809.38,"top":637.5,"bottom":981.25,"safeRadius":140},{"x":1575,"y":812.5,"top":637.5,"bottom":987.5,"safeRadius":143.54},{"x":1587.5,"y":817.19,"top":637.5,"bottom":996.88,"safeRadius":143.28},{"x":1600,"y":823.44,"top":631.25,"bottom":1015.63,"safeRadius":142.43},{"x":1612.5,"y":818.75,"top":615.63,"bottom":1021.88,"safeRadius":151.57},{"x":1625,"y":815.63,"top":603.13,"bottom":1028.13,"safeRadius":157.86},{"x":1637.5,"y":823.44,"top":600,"bottom":1046.88,"safeRadius":154.85},{"x":1650,"y":845.31,"top":600,"bottom":1090.63,"safeRadius":141.49},{"x":1662.5,"y":848.44,"top":600,"bottom":1096.88,"safeRadius":143.14},{"x":1675,"y":848.44,"top":596.88,"bottom":1100,"safeRadius":147.28},{"x":1687.5,"y":846.88,"top":593.75,"bottom":1100,"safeRadius":153.92},{"x":1700,"y":845.31,"top":590.63,"bottom":1100,"safeRadius":158.06},{"x":1712.5,"y":842.19,"top":587.5,"bottom":1096.88,"safeRadius":165.13},{"x":1725,"y":835.94,"top":575,"bottom":1096.88,"safeRadius":174.71},{"x":1737.5,"y":831.25,"top":562.5,"bottom":1100,"safeRadius":165.64},{"x":1750,"y":832.81,"top":556.25,"bottom":1109.38,"safeRadius":163.99},{"x":1762.5,"y":840.63,"top":550,"bottom":1131.25,"safeRadius":164.85},{"x":1775,"y":850,"top":546.88,"bottom":1153.13,"safeRadius":168.21},{"x":1787.5,"y":859.38,"top":559.38,"bottom":1159.38,"safeRadius":169.71},{"x":1800,"y":867.19,"top":571.88,"bottom":1162.5,"safeRadius":165.13},{"x":1812.5,"y":890.63,"top":621.88,"bottom":1159.38,"safeRadius":168.67},{"x":1825,"y":914.06,"top":662.5,"bottom":1165.63,"safeRadius":181.07},{"x":1837.5,"y":918.75,"top":668.75,"bottom":1168.75,"safeRadius":180.56},{"x":1850,"y":926.56,"top":675,"bottom":1178.13,"safeRadius":179.35},{"x":1862.5,"y":934.38,"top":675,"bottom":1193.75,"safeRadius":178.49},{"x":1875,"y":940.63,"top":675,"bottom":1206.25,"safeRadius":177.63},{"x":1887.5,"y":943.75,"top":675,"bottom":1212.5,"safeRadius":179.28},{"x":1900,"y":948.44,"top":681.25,"bottom":1215.63,"safeRadius":180.31},{"x":1912.5,"y":951.56,"top":693.75,"bottom":1209.38,"safeRadius":183.21},{"x":1925,"y":956.25,"top":703.13,"bottom":1209.38,"safeRadius":181.57},{"x":1937.5,"y":962.5,"top":715.63,"bottom":1209.38,"safeRadius":182.43},{"x":1950,"y":973.44,"top":737.5,"bottom":1209.38,"safeRadius":188.28},{"x":1962.5,"y":978.13,"top":746.88,"bottom":1209.38,"safeRadius":186.64},{"x":1975,"y":981.25,"top":753.13,"bottom":1209.38,"safeRadius":185},{"x":1987.5,"y":979.69,"top":756.25,"bottom":1203.13,"safeRadius":182.5},{"x":2000,"y":979.69,"top":756.25,"bottom":1203.13,"safeRadius":181.04},{"x":2012.5,"y":976.56,"top":753.13,"bottom":1200,"safeRadius":182.07},{"x":2025,"y":970.31,"top":743.75,"bottom":1196.88,"safeRadius":182.68},{"x":2037.5,"y":962.5,"top":728.13,"bottom":1196.88,"safeRadius":179.32},{"x":2050,"y":957.81,"top":718.75,"bottom":1196.88,"safeRadius":180.96},{"x":2062.5,"y":959.38,"top":721.88,"bottom":1196.88,"safeRadius":185.1},{"x":2075,"y":959.38,"top":721.88,"bottom":1196.88,"safeRadius":189.25},{"x":2087.5,"y":957.81,"top":715.63,"bottom":1200,"safeRadius":193.39},{"x":2100,"y":951.56,"top":696.88,"bottom":1206.25,"safeRadius":192.53},{"x":2112.5,"y":935.94,"top":662.5,"bottom":1209.38,"safeRadius":184.17},{"x":2125,"y":929.69,"top":650,"bottom":1209.38,"safeRadius":183.31},{"x":2137.5,"y":937.5,"top":653.13,"bottom":1221.88,"safeRadius":192.46},{"x":2150,"y":946.88,"top":659.38,"bottom":1234.38,"safeRadius":204.1},{"x":2162.5,"y":956.25,"top":662.5,"bottom":1250,"safeRadius":215.74},{"x":2175,"y":967.19,"top":675,"bottom":1259.38,"safeRadius":215.53},{"x":2187.5,"y":985.94,"top":684.38,"bottom":1287.5,"safeRadius":204.68},{"x":2200,"y":1003.13,"top":690.63,"bottom":1315.63,"safeRadius":196.32},{"x":2212.5,"y":1007.81,"top":690.63,"bottom":1325,"safeRadius":195.46},{"x":2225,"y":1006.25,"top":687.5,"bottom":1325,"safeRadius":202.1},{"x":2237.5,"y":1006.25,"top":684.38,"bottom":1328.13,"safeRadius":206.24},{"x":2250,"y":1007.81,"top":684.38,"bottom":1331.25,"safeRadius":207.89},{"x":2262.5,"y":1009.38,"top":681.25,"bottom":1337.5,"safeRadius":208.6},{"x":2275,"y":1009.38,"top":678.13,"bottom":1340.63,"safeRadius":202.99},{"x":2287.5,"y":1012.5,"top":678.13,"bottom":1346.88,"safeRadius":200.49},{"x":2300,"y":1018.75,"top":678.13,"bottom":1359.38,"safeRadius":201.35},{"x":2312.5,"y":1028.13,"top":675,"bottom":1381.25,"safeRadius":200.13},{"x":2325,"y":1029.69,"top":678.13,"bottom":1381.25,"safeRadius":191.17},{"x":2337.5,"y":1031.25,"top":687.5,"bottom":1375,"safeRadius":181.17},{"x":2350,"y":1032.81,"top":700,"bottom":1365.63,"safeRadius":172.21},{"x":2362.5,"y":1040.63,"top":715.63,"bottom":1365.63,"safeRadius":165.13},{"x":2375,"y":1051.56,"top":731.25,"bottom":1371.88,"safeRadius":165.13},{"x":2387.5,"y":1059.38,"top":740.63,"bottom":1378.13,"safeRadius":162.63},{"x":2400,"y":1076.56,"top":753.13,"bottom":1400,"safeRadius":173.06},{"x":2412.5,"y":1126.56,"top":771.88,"bottom":1481.25,"safeRadius":208.89},{"x":2425,"y":1140.63,"top":793.75,"bottom":1487.5,"safeRadius":203.03},{"x":2437.5,"y":1151.56,"top":818.75,"bottom":1484.38,"safeRadius":197.18},{"x":2450,"y":1156.25,"top":831.25,"bottom":1481.25,"safeRadius":198.82},{"x":2462.5,"y":1156.25,"top":837.5,"bottom":1475,"safeRadius":202.96},{"x":2475,"y":1157.81,"top":840.63,"bottom":1475,"safeRadius":204.6},{"x":2487.5,"y":1159.38,"top":843.75,"bottom":1475,"safeRadius":208.74},{"x":2500,"y":1179.69,"top":884.38,"bottom":1475,"safeRadius":195.39},{"x":2512.5,"y":1189.06,"top":906.25,"bottom":1471.88,"safeRadius":192.03},{"x":2525,"y":1192.19,"top":915.63,"bottom":1468.75,"safeRadius":193.67},{"x":2537.5,"y":1193.75,"top":921.88,"bottom":1465.63,"safeRadius":197.81},{"x":2550,"y":1193.75,"top":928.13,"bottom":1459.38,"safeRadius":201.95},{"x":2562.5,"y":1189.06,"top":928.13,"bottom":1450,"safeRadius":208.6},{"x":2575,"y":1185.94,"top":925,"bottom":1446.88,"safeRadius":207.68},{"x":2587.5,"y":1179.69,"top":921.88,"bottom":1437.5,"safeRadius":208.54},{"x":2600,"y":1170.31,"top":906.25,"bottom":1434.38,"safeRadius":208.71},{"x":2612.5,"y":1157.81,"top":887.5,"bottom":1428.13,"safeRadius":202.86},{"x":2625,"y":1146.88,"top":865.63,"bottom":1428.13,"safeRadius":197},{"x":2637.5,"y":1129.69,"top":831.25,"bottom":1428.13,"safeRadius":188.64},{"x":2650,"y":1115.63,"top":800,"bottom":1431.25,"safeRadius":180.28},{"x":2662.5,"y":1109.38,"top":781.25,"bottom":1437.5,"safeRadius":179.42},{"x":2675,"y":1106.25,"top":768.75,"bottom":1443.75,"safeRadius":181.07},{"x":2687.5,"y":1106.25,"top":762.5,"bottom":1450,"safeRadius":185.21},{"x":2700,"y":1103.13,"top":750,"bottom":1456.25,"safeRadius":186.85},{"x":2712.5,"y":1098.44,"top":734.38,"bottom":1462.5,"safeRadius":188.49},{"x":2725,"y":1095.31,"top":725,"bottom":1465.63,"safeRadius":190.13},{"x":2737.5,"y":1089.06,"top":721.88,"bottom":1456.25,"safeRadius":189.28},{"x":2750,"y":1084.38,"top":721.88,"bottom":1446.88,"safeRadius":189.88},{"x":2762.5,"y":1076.56,"top":715.63,"bottom":1437.5,"safeRadius":192.38},{"x":2775,"y":1068.75,"top":709.38,"bottom":1428.13,"safeRadius":195.92},{"x":2787.5,"y":1059.38,"top":690.63,"bottom":1428.13,"safeRadius":200.49},{"x":2800,"y":1043.75,"top":659.38,"bottom":1428.13,"safeRadius":201.53},{"x":2812.5,"y":1031.25,"top":634.38,"bottom":1428.13,"safeRadius":206.95},{"x":2825,"y":1020.31,"top":615.63,"bottom":1425,"safeRadius":213.85},{"x":2837.5,"y":1010.94,"top":603.13,"bottom":1418.75,"safeRadius":220.74},{"x":2850,"y":1003.13,"top":596.88,"bottom":1409.38,"safeRadius":227.63},{"x":2862.5,"y":996.88,"top":593.75,"bottom":1400,"safeRadius":225.24},{"x":2875,"y":993.75,"top":590.63,"bottom":1396.88,"safeRadius":219.2},{"x":2887.5,"y":992.19,"top":590.63,"bottom":1393.75,"safeRadius":214.63},{"x":2900,"y":987.5,"top":587.5,"bottom":1387.5,"safeRadius":215.49},{"x":2912.5,"y":975,"top":584.38,"bottom":1365.63,"safeRadius":221.35},{"x":2925,"y":956.25,"top":568.75,"bottom":1343.75,"safeRadius":232.21},{"x":2937.5,"y":943.75,"top":553.13,"bottom":1334.38,"safeRadius":238.06},{"x":2950,"y":932.81,"top":534.38,"bottom":1331.25,"safeRadius":233.17},{"x":2962.5,"y":929.69,"top":531.25,"bottom":1328.13,"safeRadius":224.2},{"x":2975,"y":918.75,"top":515.63,"bottom":1321.88,"safeRadius":220.67},{"x":2987.5,"y":885.94,"top":475,"bottom":1296.88,"safeRadius":227.74},{"x":3000,"y":850,"top":443.75,"bottom":1256.25,"safeRadius":225.24},{"x":3012.5,"y":834.38,"top":425,"bottom":1243.75,"safeRadius":229.81},{"x":3025,"y":821.88,"top":412.5,"bottom":1231.25,"safeRadius":231.85},{"x":3037.5,"y":814.06,"top":406.25,"bottom":1221.88,"safeRadius":230.99},{"x":3050,"y":812.5,"top":421.88,"bottom":1203.13,"safeRadius":232.63},{"x":3062.5,"y":810.94,"top":434.38,"bottom":1187.5,"safeRadius":227.74},{"x":3075,"y":806.25,"top":431.25,"bottom":1181.25,"safeRadius":220.67},{"x":3087.5,"y":798.44,"top":418.75,"bottom":1178.13,"safeRadius":213.6},{"x":3100,"y":790.63,"top":403.13,"bottom":1178.13,"safeRadius":207.56},{"x":3112.5,"y":787.5,"top":396.88,"bottom":1178.13,"safeRadius":200.49},{"x":3125,"y":787.5,"top":396.88,"bottom":1178.13,"safeRadius":193.42},{"x":3137.5,"y":785.94,"top":396.88,"bottom":1175,"safeRadius":186.35},{"x":3150,"y":770.31,"top":393.75,"bottom":1146.88,"safeRadius":192.81},{"x":3162.5,"y":756.25,"top":393.75,"bottom":1118.75,"safeRadius":201.17},{"x":3175,"y":739.06,"top":381.25,"bottom":1096.88,"safeRadius":209.53},{"x":3187.5,"y":726.56,"top":368.75,"bottom":1084.38,"safeRadius":204.71},{"x":3200,"y":709.38,"top":343.75,"bottom":1075,"safeRadius":200.92},{"x":3212.5,"y":700,"top":331.25,"bottom":1068.75,"safeRadius":194.45},{"x":3225,"y":693.75,"top":325,"bottom":1062.5,"safeRadius":189.88},{"x":3237.5,"y":685.94,"top":321.88,"bottom":1050,"safeRadius":188.85},{"x":3250,"y":678.13,"top":318.75,"bottom":1037.5,"safeRadius":191.35},{"x":3262.5,"y":664.06,"top":315.63,"bottom":1012.5,"safeRadius":195.92},{"x":3275,"y":648.44,"top":312.5,"bottom":984.38,"safeRadius":197.99},{"x":3287.5,"y":634.38,"top":309.38,"bottom":959.38,"safeRadius":197.99},{"x":3300,"y":628.13,"top":309.38,"bottom":946.88,"safeRadius":195.92},{"x":3312.5,"y":626.56,"top":309.38,"bottom":943.75,"safeRadius":189.88},{"x":3325,"y":625,"top":309.38,"bottom":940.63,"safeRadius":185.31},{"x":3337.5,"y":623.44,"top":309.38,"bottom":937.5,"safeRadius":180.74},{"x":3350,"y":625,"top":309.38,"bottom":940.63,"safeRadius":176.6},{"x":3362.5,"y":626.56,"top":312.5,"bottom":940.63,"safeRadius":169.96},{"x":3375,"y":626.56,"top":312.5,"bottom":940.63,"safeRadius":165.81},{"x":3387.5,"y":589.06,"top":315.63,"bottom":862.5,"safeRadius":191.67},{"x":3400,"y":584.38,"top":318.75,"bottom":850,"safeRadius":192.53},{"x":3412.5,"y":584.38,"top":321.88,"bottom":846.88,"safeRadius":188.39},{"x":3425,"y":587.5,"top":334.38,"bottom":840.63,"safeRadius":181.75},{"x":3437.5,"y":587.5,"top":343.75,"bottom":831.25,"safeRadius":177.6},{"x":3450,"y":584.38,"top":350,"bottom":818.75,"safeRadius":175.96},{"x":3462.5,"y":578.13,"top":353.13,"bottom":803.13,"safeRadius":176.82},{"x":3475,"y":576.56,"top":359.38,"bottom":793.75,"safeRadius":172.68},{"x":3487.5,"y":573.44,"top":362.5,"bottom":784.38,"safeRadius":171.04},{"x":3500,"y":571.88,"top":362.5,"bottom":781.25,"safeRadius":170},{"x":3512.5,"y":571.88,"top":362.5,"bottom":781.25,"safeRadius":170},{"x":3525,"y":573.44,"top":362.5,"bottom":784.38,"safeRadius":170},{"x":3537.5,"y":571.88,"top":359.38,"bottom":784.38,"safeRadius":173.54},{"x":3550,"y":570.31,"top":356.25,"bottom":784.38,"safeRadius":168.99},{"x":3562.5,"y":570.31,"top":350,"bottom":790.63,"safeRadius":158.99},{"x":3575,"y":573.44,"top":346.88,"bottom":800,"safeRadius":150.03},{"x":3587.5,"y":576.56,"top":346.88,"bottom":806.25,"safeRadius":141.07},{"x":3600,"y":585.94,"top":346.88,"bottom":825,"safeRadius":134.17},{"x":3612.5,"y":589.06,"top":346.88,"bottom":831.25,"safeRadius":125.21},{"x":3625,"y":587.5,"top":346.88,"bottom":828.13,"safeRadius":114.6},{"x":3637.5,"y":592.19,"top":353.13,"bottom":831.25,"safeRadius":109.6},{"x":3650,"y":598.44,"top":362.5,"bottom":834.38,"safeRadius":108.99},{"x":3662.5,"y":604.69,"top":368.75,"bottom":840.63,"safeRadius":109.6},{"x":3675,"y":612.5,"top":375,"bottom":850,"safeRadius":102.96},{"x":3687.5,"y":634.38,"top":381.25,"bottom":887.5,"safeRadius":102.53},{"x":3700,"y":650,"top":393.75,"bottom":906.25,"safeRadius":108.99},{"x":3712.5,"y":654.69,"top":406.25,"bottom":903.13,"safeRadius":109.85},{"x":3725,"y":696.88,"top":490.63,"bottom":903.13,"safeRadius":138.21},{"x":3737.5,"y":703.13,"top":503.13,"bottom":903.13,"safeRadius":137.53},{"x":3750,"y":707.81,"top":509.38,"bottom":906.25,"safeRadius":136.67},{"x":3762.5,"y":714.06,"top":518.75,"bottom":909.38,"safeRadius":135.81},{"x":3775,"y":732.81,"top":546.88,"bottom":918.75,"safeRadius":127.28},{"x":3787.5,"y":740.63,"top":553.13,"bottom":928.13,"safeRadius":129.78},{"x":3800,"y":750,"top":556.25,"bottom":943.75,"safeRadius":127.28},{"x":3812.5,"y":764.06,"top":556.25,"bottom":971.88,"safeRadius":129.78},{"x":3825,"y":771.88,"top":556.25,"bottom":987.5,"safeRadius":130.64},{"x":3837.5,"y":773.44,"top":556.25,"bottom":990.63,"safeRadius":128.99},{"x":3850,"y":778.13,"top":562.5,"bottom":993.75,"safeRadius":126.24},{"x":3862.5,"y":781.25,"top":565.63,"bottom":996.88,"safeRadius":120.21},{"x":3875,"y":789.06,"top":578.13,"bottom":1000,"safeRadius":115.03},{"x":3887.5,"y":800,"top":596.88,"bottom":1003.13,"safeRadius":108.99},{"x":3900,"y":817.19,"top":631.25,"bottom":1003.13,"safeRadius":105.46},{"x":3912.5,"y":823.44,"top":643.75,"bottom":1003.13,"safeRadius":97.96},{"x":3925,"y":829.69,"top":653.13,"bottom":1006.25,"safeRadius":94.42},{"x":3937.5,"y":835.94,"top":659.38,"bottom":1012.5,"safeRadius":93.39},{"x":3950,"y":846.88,"top":665.63,"bottom":1028.13,"safeRadius":95.89},{"x":3962.5,"y":870.31,"top":671.88,"bottom":1068.75,"safeRadius":111.75},{"x":3975,"y":895.31,"top":693.75,"bottom":1096.88,"safeRadius":109.07},{"x":3987.5,"y":910.94,"top":721.88,"bottom":1100,"safeRadius":100.71},{"x":4000,"y":923.44,"top":746.88,"bottom":1100,"safeRadius":94.85},{"x":4012.5,"y":929.69,"top":756.25,"bottom":1103.13,"safeRadius":94.42},{"x":4025,"y":934.38,"top":762.5,"bottom":1106.25,"safeRadius":97.96},{"x":4037.5,"y":943.75,"top":765.63,"bottom":1121.88,"safeRadius":101.49},{"x":4050,"y":953.13,"top":765.63,"bottom":1140.63,"safeRadius":106.49},{"x":4062.5,"y":956.25,"top":762.5,"bottom":1150,"safeRadius":115.46},{"x":4075,"y":954.69,"top":753.13,"bottom":1156.25,"safeRadius":125.46},{"x":4087.5,"y":943.75,"top":725,"bottom":1162.5,"safeRadius":139.6},{"x":4100,"y":928.13,"top":687.5,"bottom":1168.75,"safeRadius":148.03},{"x":4112.5,"y":925,"top":678.13,"bottom":1171.88,"safeRadius":149.68},{"x":4125,"y":920.31,"top":671.88,"bottom":1168.75,"safeRadius":151.32},{"x":4137.5,"y":921.88,"top":671.88,"bottom":1171.88,"safeRadius":155.46},{"x":4150,"y":918.75,"top":668.75,"bottom":1168.75,"safeRadius":157.1},{"x":4162.5,"y":918.75,"top":665.63,"bottom":1171.88,"safeRadius":161.24},{"x":4175,"y":915.63,"top":653.13,"bottom":1178.13,"safeRadius":162.89},{"x":4187.5,"y":909.38,"top":631.25,"bottom":1187.5,"safeRadius":162.03},{"x":4200,"y":903.13,"top":609.38,"bottom":1196.88,"safeRadius":161.6},{"x":4212.5,"y":900,"top":600,"bottom":1200,"safeRadius":165.13},{"x":4225,"y":896.88,"top":590.63,"bottom":1203.13,"safeRadius":171.17},{"x":4237.5,"y":896.88,"top":587.5,"bottom":1206.25,"safeRadius":179.28},{"x":4250,"y":889.06,"top":571.88,"bottom":1206.25,"safeRadius":186.78},{"x":4262.5,"y":876.56,"top":546.88,"bottom":1206.25,"safeRadius":192.63},{"x":4275,"y":867.19,"top":528.13,"bottom":1206.25,"safeRadius":199.53},{"x":4287.5,"y":842.19,"top":481.25,"bottom":1203.13,"safeRadius":187.46},{"x":4300,"y":829.69,"top":456.25,"bottom":1203.13,"safeRadius":181.6},{"x":4312.5,"y":823.44,"top":446.88,"bottom":1200,"safeRadius":180.74},{"x":4325,"y":818.75,"top":440.63,"bottom":1196.88,"safeRadius":181.78},{"x":4337.5,"y":815.63,"top":437.5,"bottom":1193.75,"safeRadius":186.35},{"x":4350,"y":807.81,"top":428.13,"bottom":1187.5,"safeRadius":193.42},{"x":4362.5,"y":798.44,"top":415.63,"bottom":1181.25,"safeRadius":197.99},{"x":4375,"y":782.81,"top":390.63,"bottom":1175,"safeRadius":196.04},{"x":4387.5,"y":762.5,"top":356.25,"bottom":1168.75,"safeRadius":192.68},{"x":4400,"y":751.56,"top":343.75,"bottom":1159.38,"safeRadius":185.78},{"x":4412.5,"y":743.75,"top":337.5,"bottom":1150,"safeRadius":178.89},{"x":4425,"y":739.06,"top":331.25,"bottom":1146.88,"safeRadius":169.93},{"x":4437.5,"y":735.94,"top":331.25,"bottom":1140.63,"safeRadius":160.96},{"x":4450,"y":732.81,"top":328.13,"bottom":1137.5,"safeRadius":152},{"x":4462.5,"y":726.56,"top":328.13,"bottom":1125,"safeRadius":144.07},{"x":4475,"y":715.63,"top":325,"bottom":1106.25,"safeRadius":138.21},{"x":4487.5,"y":704.69,"top":325,"bottom":1084.38,"safeRadius":131.32},{"x":4500,"y":695.31,"top":318.75,"bottom":1071.88,"safeRadius":124.42},{"x":4512.5,"y":689.06,"top":315.63,"bottom":1062.5,"safeRadius":116.49},{"x":4525,"y":685.94,"top":315.63,"bottom":1056.25,"safeRadius":107.53},{"x":4537.5,"y":689.06,"top":325,"bottom":1053.13,"safeRadius":97.96},{"x":4550,"y":696.88,"top":346.88,"bottom":1046.88,"safeRadius":86.32},{"x":4562.5,"y":700,"top":362.5,"bottom":1037.5,"safeRadius":76.75},{"x":4575,"y":687.5,"top":365.63,"bottom":1009.38,"safeRadius":76.75},{"x":4587.5,"y":645.31,"top":359.38,"bottom":931.25,"safeRadius":97.96},{"x":4600,"y":628.13,"top":340.63,"bottom":915.63,"safeRadius":108.39},{"x":4612.5,"y":610.94,"top":318.75,"bottom":903.13,"safeRadius":116.75},{"x":4625,"y":542.19,"top":315.63,"bottom":768.75,"safeRadius":143.21},{"x":4637.5,"y":535.94,"top":318.75,"bottom":753.13,"safeRadius":134.07},{"x":4650,"y":539.06,"top":331.25,"bottom":746.88,"safeRadius":132.43},{"x":4662.5,"y":548.44,"top":359.38,"bottom":737.5,"safeRadius":135.78},{"x":4675,"y":556.25,"top":384.38,"bottom":728.13,"safeRadius":136.64},{"x":4687.5,"y":559.38,"top":393.75,"bottom":725,"safeRadius":135},{"x":4700,"y":554.69,"top":390.63,"bottom":718.75,"safeRadius":135},{"x":4712.5,"y":546.88,"top":375,"bottom":718.75,"safeRadius":132.25},{"x":4725,"y":539.06,"top":359.38,"bottom":718.75,"safeRadius":131.39},{"x":4737.5,"y":534.38,"top":350,"bottom":718.75,"safeRadius":130.53},{"x":4750,"y":523.44,"top":334.38,"bottom":712.5,"safeRadius":127.18},{"x":4762.5,"y":514.06,"top":321.88,"bottom":706.25,"safeRadius":123.82},{"x":4775,"y":501.56,"top":303.13,"bottom":700,"safeRadius":117.96},{"x":4787.5,"y":490.63,"top":284.38,"bottom":696.88,"safeRadius":112.1},{"x":4796.88,"y":485.94,"top":278.13,"bottom":693.75,"safeRadius":113.14}],"length":6075.7,"minConservativeRadius":76.7,"verticalSpan":707.8},{"id":"narrow","name":"窄缝 · 采尘深径","points":[{"x":0,"y":2018.75,"top":1853.13,"bottom":2184.38,"safeRadius":131.75},{"x":12.5,"y":2020.31,"top":1859.38,"bottom":2181.25,"safeRadius":125.1},{"x":25,"y":2020.31,"top":1865.63,"bottom":2175,"safeRadius":120.96},{"x":37.5,"y":2021.88,"top":1871.88,"bottom":2171.88,"safeRadius":116.82},{"x":50,"y":2018.75,"top":1875,"bottom":2162.5,"safeRadius":115.18},{"x":62.5,"y":2014.06,"top":1875,"bottom":2153.13,"safeRadius":113.14},{"x":75,"y":2010.94,"top":1875,"bottom":2146.88,"safeRadius":105.03},{"x":87.5,"y":2007.81,"top":1871.88,"bottom":2143.75,"safeRadius":95.46},{"x":100,"y":2004.69,"top":1865.63,"bottom":2143.75,"safeRadius":87.35},{"x":112.5,"y":2001.56,"top":1859.38,"bottom":2143.75,"safeRadius":77.78},{"x":125,"y":2004.69,"top":1859.38,"bottom":2150,"safeRadius":74.25},{"x":137.5,"y":2012.5,"top":1871.88,"bottom":2153.13,"safeRadius":74.68},{"x":150,"y":2031.25,"top":1903.13,"bottom":2159.38,"safeRadius":85.53},{"x":162.5,"y":2043.75,"top":1921.88,"bottom":2165.63,"safeRadius":91.39},{"x":175,"y":2053.13,"top":1931.25,"bottom":2175,"safeRadius":94.75},{"x":187.5,"y":2068.75,"top":1943.75,"bottom":2193.75,"safeRadius":87},{"x":200,"y":2078.13,"top":1950,"bottom":2206.25,"safeRadius":83.64},{"x":212.5,"y":2085.94,"top":1953.13,"bottom":2218.75,"safeRadius":80.28},{"x":225,"y":2090.63,"top":1959.38,"bottom":2221.88,"safeRadius":82.78},{"x":237.5,"y":2092.19,"top":1959.38,"bottom":2225,"safeRadius":87.35},{"x":250,"y":2093.75,"top":1962.5,"bottom":2225,"safeRadius":93.39},{"x":262.5,"y":2092.19,"top":1959.38,"bottom":2225,"safeRadius":98.99},{"x":275,"y":2090.63,"top":1956.25,"bottom":2225,"safeRadius":108.57},{"x":287.5,"y":2089.06,"top":1953.13,"bottom":2225,"safeRadius":106.07},{"x":300,"y":2087.5,"top":1946.88,"bottom":2228.13,"safeRadius":101.49},{"x":312.5,"y":2085.94,"top":1946.88,"bottom":2225,"safeRadius":94.42},{"x":325,"y":2082.81,"top":1943.75,"bottom":2221.88,"safeRadius":88.39},{"x":337.5,"y":2079.69,"top":1946.88,"bottom":2212.5,"safeRadius":84.85},{"x":350,"y":2078.13,"top":1950,"bottom":2206.25,"safeRadius":82.78},{"x":362.5,"y":2073.44,"top":1946.88,"bottom":2200,"safeRadius":80.28},{"x":375,"y":2065.63,"top":1943.75,"bottom":2187.5,"safeRadius":83.64},{"x":387.5,"y":2053.13,"top":1934.38,"bottom":2171.88,"safeRadius":89.5},{"x":400,"y":2037.5,"top":1915.63,"bottom":2159.38,"safeRadius":86.82},{"x":412.5,"y":2021.88,"top":1890.63,"bottom":2153.13,"safeRadius":78.46},{"x":425,"y":2010.94,"top":1878.13,"bottom":2143.75,"safeRadius":75.1},{"x":437.5,"y":2006.25,"top":1871.88,"bottom":2140.63,"safeRadius":74.25},{"x":450,"y":2003.13,"top":1865.63,"bottom":2140.63,"safeRadius":77.78},{"x":462.5,"y":1998.44,"top":1859.38,"bottom":2137.5,"safeRadius":83.82},{"x":475,"y":1987.5,"top":1840.63,"bottom":2134.38,"safeRadius":87.35},{"x":487.5,"y":1973.44,"top":1815.63,"bottom":2131.25,"safeRadius":92.78},{"x":500,"y":1959.38,"top":1803.13,"bottom":2115.63,"safeRadius":93.64},{"x":512.5,"y":1946.88,"top":1796.88,"bottom":2096.88,"safeRadius":87.78},{"x":525,"y":1935.94,"top":1790.63,"bottom":2081.25,"safeRadius":84.85},{"x":537.5,"y":1932.81,"top":1790.63,"bottom":2075,"safeRadius":88.39},{"x":550,"y":1929.69,"top":1787.5,"bottom":2071.88,"safeRadius":95.46},{"x":562.5,"y":1926.56,"top":1781.25,"bottom":2071.88,"safeRadius":102.53},{"x":575,"y":1923.44,"top":1778.13,"bottom":2068.75,"safeRadius":107.6},{"x":587.5,"y":1918.75,"top":1775,"bottom":2062.5,"safeRadius":108.46},{"x":600,"y":1909.38,"top":1768.75,"bottom":2050,"safeRadius":111.82},{"x":612.5,"y":1900,"top":1759.38,"bottom":2040.63,"safeRadius":110.78},{"x":625,"y":1893.75,"top":1753.13,"bottom":2034.38,"safeRadius":109.93},{"x":637.5,"y":1890.63,"top":1750,"bottom":2031.25,"safeRadius":111.57},{"x":650,"y":1890.63,"top":1750,"bottom":2031.25,"safeRadius":115.71},{"x":662.5,"y":1890.63,"top":1750,"bottom":2031.25,"safeRadius":115},{"x":675,"y":1889.06,"top":1750,"bottom":2028.13,"safeRadius":112.25},{"x":687.5,"y":1885.94,"top":1750,"bottom":2021.88,"safeRadius":110.61},{"x":700,"y":1881.25,"top":1746.88,"bottom":2015.63,"safeRadius":110},{"x":712.5,"y":1878.13,"top":1743.75,"bottom":2012.5,"safeRadius":111.64},{"x":725,"y":1878.13,"top":1740.63,"bottom":2015.63,"safeRadius":112.5},{"x":737.5,"y":1879.69,"top":1737.5,"bottom":2021.88,"safeRadius":114.14},{"x":750,"y":1884.38,"top":1734.38,"bottom":2034.38,"safeRadius":115.78},{"x":762.5,"y":1893.75,"top":1734.38,"bottom":2053.13,"safeRadius":112.43},{"x":775,"y":1901.56,"top":1743.75,"bottom":2059.38,"safeRadius":109.07},{"x":787.5,"y":1909.38,"top":1750,"bottom":2068.75,"safeRadius":108.21},{"x":800,"y":1937.5,"top":1756.25,"bottom":2118.75,"safeRadius":89.85},{"x":812.5,"y":1956.25,"top":1759.38,"bottom":2153.13,"safeRadius":81.32},{"x":825,"y":1965.63,"top":1762.5,"bottom":2168.75,"safeRadius":86.32},{"x":837.5,"y":1973.44,"top":1765.63,"bottom":2181.25,"safeRadius":90.71},{"x":850,"y":1978.13,"top":1762.5,"bottom":2193.75,"safeRadius":92.35},{"x":862.5,"y":1981.25,"top":1759.38,"bottom":2203.13,"safeRadius":95.46},{"x":875,"y":1982.81,"top":1756.25,"bottom":2209.38,"safeRadius":101.49},{"x":887.5,"y":1981.25,"top":1753.13,"bottom":2209.38,"safeRadius":112.1},{"x":900,"y":1979.69,"top":1753.13,"bottom":2206.25,"safeRadius":121.67},{"x":912.5,"y":1979.69,"top":1756.25,"bottom":2203.13,"safeRadius":116.67},{"x":925,"y":1987.5,"top":1765.63,"bottom":2209.38,"safeRadius":112.1},{"x":937.5,"y":2003.13,"top":1787.5,"bottom":2218.75,"safeRadius":115.64},{"x":950,"y":2015.63,"top":1803.13,"bottom":2228.13,"safeRadius":119.6},{"x":962.5,"y":2029.69,"top":1825,"bottom":2234.38,"safeRadius":127.96},{"x":975,"y":2042.19,"top":1834.38,"bottom":2250,"safeRadius":133.82},{"x":987.5,"y":2067.19,"top":1846.88,"bottom":2287.5,"safeRadius":136.32},{"x":1000,"y":2081.25,"top":1862.5,"bottom":2300,"safeRadius":130.46},{"x":1012.5,"y":2093.75,"top":1881.25,"bottom":2306.25,"safeRadius":124.6},{"x":1025,"y":2104.69,"top":1896.88,"bottom":2312.5,"safeRadius":119.6},{"x":1037.5,"y":2110.94,"top":1906.25,"bottom":2315.63,"safeRadius":120.21},{"x":1050,"y":2115.63,"top":1912.5,"bottom":2318.75,"safeRadius":116.67},{"x":1062.5,"y":2117.19,"top":1912.5,"bottom":2321.88,"safeRadius":113.14},{"x":1075,"y":2118.75,"top":1912.5,"bottom":2325,"safeRadius":107.53},{"x":1087.5,"y":2121.88,"top":1912.5,"bottom":2331.25,"safeRadius":105.03},{"x":1100,"y":2129.69,"top":1918.75,"bottom":2340.63,"safeRadius":108.39},{"x":1112.5,"y":2135.94,"top":1928.13,"bottom":2343.75,"safeRadius":109.25},{"x":1125,"y":2154.69,"top":1962.5,"bottom":2346.88,"safeRadius":120.1},{"x":1137.5,"y":2173.44,"top":1996.88,"bottom":2350,"safeRadius":130.96},{"x":1150,"y":2182.81,"top":2015.63,"bottom":2350,"safeRadius":134.32},{"x":1162.5,"y":2189.06,"top":2025,"bottom":2353.13,"safeRadius":134.57},{"x":1175,"y":2196.88,"top":2031.25,"bottom":2362.5,"safeRadius":133.11},{"x":1187.5,"y":2210.94,"top":2034.38,"bottom":2387.5,"safeRadius":124.75},{"x":1200,"y":2235.94,"top":2034.38,"bottom":2437.5,"safeRadius":108.89},{"x":1212.5,"y":2234.38,"top":2028.13,"bottom":2440.63,"safeRadius":115.53},{"x":1225,"y":2231.25,"top":2025,"bottom":2437.5,"safeRadius":122.18},{"x":1237.5,"y":2228.13,"top":2025,"bottom":2431.25,"safeRadius":128.82},{"x":1250,"y":2231.25,"top":2028.13,"bottom":2434.38,"safeRadius":130.46},{"x":1262.5,"y":2235.94,"top":2031.25,"bottom":2440.63,"safeRadius":129.6},{"x":1275,"y":2245.31,"top":2037.5,"bottom":2453.13,"safeRadius":126.24},{"x":1287.5,"y":2275,"top":2050,"bottom":2500,"safeRadius":119.17},{"x":1300,"y":2282.81,"top":2059.38,"bottom":2506.25,"safeRadius":125.64},{"x":1312.5,"y":2285.94,"top":2065.63,"bottom":2506.25,"safeRadius":126.24},{"x":1325,"y":2284.38,"top":2068.75,"bottom":2500,"safeRadius":116.67},{"x":1337.5,"y":2281.25,"top":2068.75,"bottom":2493.75,"safeRadius":108.57},{"x":1350,"y":2276.56,"top":2068.75,"bottom":2484.38,"safeRadius":98.99},{"x":1362.5,"y":2273.44,"top":2071.88,"bottom":2475,"safeRadius":90.89},{"x":1375,"y":2276.56,"top":2084.38,"bottom":2468.75,"safeRadius":88.82},{"x":1387.5,"y":2282.81,"top":2100,"bottom":2465.63,"safeRadius":89.68},{"x":1400,"y":2295.31,"top":2128.13,"bottom":2462.5,"safeRadius":95.53},{"x":1412.5,"y":2310.94,"top":2159.38,"bottom":2462.5,"safeRadius":103.89},{"x":1425,"y":2326.56,"top":2184.38,"bottom":2468.75,"safeRadius":112.25},{"x":1437.5,"y":2334.38,"top":2196.88,"bottom":2471.88,"safeRadius":112.5},{"x":1450,"y":2342.19,"top":2203.13,"bottom":2481.25,"safeRadius":109.14},{"x":1462.5,"y":2343.75,"top":2203.13,"bottom":2484.38,"safeRadius":113.28},{"x":1475,"y":2345.31,"top":2200,"bottom":2490.63,"safeRadius":114.93},{"x":1487.5,"y":2346.88,"top":2200,"bottom":2493.75,"safeRadius":116.67},{"x":1500,"y":2345.31,"top":2196.88,"bottom":2493.75,"safeRadius":109.6},{"x":1512.5,"y":2340.63,"top":2190.63,"bottom":2490.63,"safeRadius":107.53},{"x":1525,"y":2334.38,"top":2184.38,"bottom":2484.38,"safeRadius":107.53},{"x":1537.5,"y":2328.13,"top":2178.13,"bottom":2478.13,"safeRadius":107.96},{"x":1550,"y":2315.63,"top":2159.38,"bottom":2471.88,"safeRadius":113.82},{"x":1562.5,"y":2306.25,"top":2146.88,"bottom":2465.63,"safeRadius":111.14},{"x":1575,"y":2295.31,"top":2134.38,"bottom":2456.25,"safeRadius":107.78},{"x":1587.5,"y":2287.5,"top":2128.13,"bottom":2446.88,"safeRadius":104.42},{"x":1600,"y":2279.69,"top":2125,"bottom":2434.38,"safeRadius":105.03},{"x":1612.5,"y":2271.88,"top":2115.63,"bottom":2428.13,"safeRadius":102.53},{"x":1625,"y":2262.5,"top":2103.13,"bottom":2421.88,"safeRadius":101.49},{"x":1637.5,"y":2259.38,"top":2096.88,"bottom":2421.88,"safeRadius":107.53},{"x":1650,"y":2256.25,"top":2093.75,"bottom":2418.75,"safeRadius":114.6},{"x":1662.5,"y":2256.25,"top":2093.75,"bottom":2418.75,"safeRadius":122.71},{"x":1675,"y":2257.81,"top":2096.88,"bottom":2418.75,"safeRadius":113.14},{"x":1687.5,"y":2257.81,"top":2100,"bottom":2415.63,"safeRadius":105.03},{"x":1700,"y":2257.81,"top":2103.13,"bottom":2412.5,"safeRadius":97.96},{"x":1712.5,"y":2254.69,"top":2103.13,"bottom":2406.25,"safeRadius":91.92},{"x":1725,"y":2251.56,"top":2100,"bottom":2403.13,"safeRadius":87.35},{"x":1737.5,"y":2246.88,"top":2096.88,"bottom":2396.88,"safeRadius":84.85},{"x":1750,"y":2235.94,"top":2084.38,"bottom":2387.5,"safeRadius":83.82},{"x":1762.5,"y":2218.75,"top":2068.75,"bottom":2368.75,"safeRadius":88.39},{"x":1775,"y":2203.13,"top":2053.13,"bottom":2353.13,"safeRadius":96.32},{"x":1787.5,"y":2189.06,"top":2040.63,"bottom":2337.5,"safeRadius":96.14},{"x":1800,"y":2179.69,"top":2034.38,"bottom":2325,"safeRadius":92.78},{"x":1812.5,"y":2173.44,"top":2031.25,"bottom":2315.63,"safeRadius":91.92},{"x":1825,"y":2165.63,"top":2028.13,"bottom":2303.13,"safeRadius":90.89},{"x":1837.5,"y":2162.5,"top":2031.25,"bottom":2293.75,"safeRadius":97.96},{"x":1850,"y":2160.94,"top":2034.38,"bottom":2287.5,"safeRadius":105},{"x":1862.5,"y":2159.38,"top":2031.25,"bottom":2287.5,"safeRadius":106.04},{"x":1875,"y":2156.25,"top":2028.13,"bottom":2284.38,"safeRadius":106.04},{"x":1887.5,"y":2151.56,"top":2021.88,"bottom":2281.25,"safeRadius":107.5},{"x":1900,"y":2146.88,"top":2012.5,"bottom":2281.25,"safeRadius":106.82},{"x":1912.5,"y":2139.06,"top":2000,"bottom":2278.13,"safeRadius":105.96},{"x":1925,"y":2131.25,"top":1987.5,"bottom":2275,"safeRadius":102.6},{"x":1937.5,"y":2125,"top":1978.13,"bottom":2271.88,"safeRadius":101.75},{"x":1950,"y":2120.31,"top":1975,"bottom":2265.63,"safeRadius":103.39},{"x":1962.5,"y":2115.63,"top":1971.88,"bottom":2259.38,"safeRadius":102.53},{"x":1975,"y":2110.94,"top":1965.63,"bottom":2256.25,"safeRadius":105.03},{"x":1987.5,"y":2106.25,"top":1959.38,"bottom":2253.13,"safeRadius":106.07},{"x":2000,"y":2103.13,"top":1953.13,"bottom":2253.13,"safeRadius":112.1},{"x":2012.5,"y":2101.56,"top":1946.88,"bottom":2256.25,"safeRadius":120.21},{"x":2025,"y":2103.13,"top":1943.75,"bottom":2262.5,"safeRadius":126.24},{"x":2037.5,"y":2107.81,"top":1943.75,"bottom":2271.88,"safeRadius":129.32},{"x":2050,"y":2115.63,"top":1943.75,"bottom":2287.5,"safeRadius":128.46},{"x":2062.5,"y":2125,"top":1943.75,"bottom":2306.25,"safeRadius":125.1},{"x":2075,"y":2135.94,"top":1943.75,"bottom":2328.13,"safeRadius":119.25},{"x":2087.5,"y":2143.75,"top":1943.75,"bottom":2343.75,"safeRadius":118.39},{"x":2100,"y":2151.56,"top":1946.88,"bottom":2356.25,"safeRadius":115.03},{"x":2112.5,"y":2151.56,"top":1946.88,"bottom":2356.25,"safeRadius":119.17},{"x":2125,"y":2156.25,"top":1953.13,"bottom":2359.38,"safeRadius":122.1},{"x":2137.5,"y":2159.38,"top":1956.25,"bottom":2362.5,"safeRadius":123.74},{"x":2150,"y":2160.94,"top":1959.38,"bottom":2362.5,"safeRadius":129.78},{"x":2162.5,"y":2162.5,"top":1959.38,"bottom":2365.63,"safeRadius":136.85},{"x":2175,"y":2167.19,"top":1962.5,"bottom":2371.88,"safeRadius":141.42},{"x":2187.5,"y":2173.44,"top":1962.5,"bottom":2384.38,"safeRadius":136.32},{"x":2200,"y":2189.06,"top":1965.63,"bottom":2412.5,"safeRadius":131.49},{"x":2212.5,"y":2198.44,"top":1965.63,"bottom":2431.25,"safeRadius":124.6},{"x":2225,"y":2206.25,"top":1971.88,"bottom":2440.63,"safeRadius":116.67},{"x":2237.5,"y":2215.63,"top":1987.5,"bottom":2443.75,"safeRadius":112.1},{"x":2250,"y":2223.44,"top":1996.88,"bottom":2450,"safeRadius":108.57},{"x":2262.5,"y":2232.81,"top":2012.5,"bottom":2453.13,"safeRadius":108.57},{"x":2275,"y":2243.75,"top":2025,"bottom":2462.5,"safeRadius":111.92},{"x":2287.5,"y":2256.25,"top":2037.5,"bottom":2475,"safeRadius":117.78},{"x":2300,"y":2265.63,"top":2046.88,"bottom":2484.38,"safeRadius":121.14},{"x":2312.5,"y":2276.56,"top":2062.5,"bottom":2490.63,"safeRadius":127},{"x":2325,"y":2298.44,"top":2103.13,"bottom":2493.75,"safeRadius":137.89},{"x":2337.5,"y":2310.94,"top":2125,"bottom":2496.88,"safeRadius":140.39},{"x":2350,"y":2318.75,"top":2137.5,"bottom":2500,"safeRadius":140.21},{"x":2362.5,"y":2325,"top":2143.75,"bottom":2506.25,"safeRadius":139.35},{"x":2375,"y":2329.69,"top":2143.75,"bottom":2515.63,"safeRadius":139.35},{"x":2387.5,"y":2340.63,"top":2146.88,"bottom":2534.38,"safeRadius":137.89},{"x":2400,"y":2348.44,"top":2153.13,"bottom":2543.75,"safeRadius":137.89},{"x":2412.5,"y":2353.13,"top":2162.5,"bottom":2543.75,"safeRadius":140.71},{"x":2425,"y":2356.25,"top":2171.88,"bottom":2540.63,"safeRadius":142.35},{"x":2437.5,"y":2356.25,"top":2175,"bottom":2537.5,"safeRadius":140.21},{"x":2450,"y":2357.81,"top":2178.13,"bottom":2537.5,"safeRadius":131.24},{"x":2462.5,"y":2357.81,"top":2175,"bottom":2540.63,"safeRadius":121.67},{"x":2475,"y":2362.5,"top":2175,"bottom":2550,"safeRadius":114.6},{"x":2487.5,"y":2367.19,"top":2171.88,"bottom":2562.5,"safeRadius":109.6},{"x":2500,"y":2382.81,"top":2175,"bottom":2590.63,"safeRadius":114.6},{"x":2512.5,"y":2389.06,"top":2178.13,"bottom":2600,"safeRadius":115.46},{"x":2525,"y":2395.31,"top":2190.63,"bottom":2600,"safeRadius":111.07},{"x":2537.5,"y":2398.44,"top":2200,"bottom":2596.88,"safeRadius":102.35},{"x":2550,"y":2404.69,"top":2212.5,"bottom":2596.88,"safeRadius":94.42},{"x":2562.5,"y":2421.88,"top":2243.75,"bottom":2600,"safeRadius":94.42},{"x":2575,"y":2435.94,"top":2268.75,"bottom":2603.13,"safeRadius":98.39},{"x":2587.5,"y":2445.31,"top":2281.25,"bottom":2609.38,"safeRadius":101.49},{"x":2600,"y":2457.81,"top":2287.5,"bottom":2628.13,"safeRadius":107.35},{"x":2612.5,"y":2467.19,"top":2293.75,"bottom":2640.63,"safeRadius":110.71},{"x":2625,"y":2476.56,"top":2309.38,"bottom":2643.75,"safeRadius":114.07},{"x":2637.5,"y":2490.63,"top":2337.5,"bottom":2643.75,"safeRadius":115.28},{"x":2650,"y":2496.88,"top":2350,"bottom":2643.75,"safeRadius":114.42},{"x":2662.5,"y":2500,"top":2353.13,"bottom":2646.88,"safeRadius":116.07},{"x":2675,"y":2504.69,"top":2359.38,"bottom":2650,"safeRadius":115.64},{"x":2687.5,"y":2506.25,"top":2362.5,"bottom":2650,"safeRadius":117.5},{"x":2700,"y":2507.81,"top":2365.63,"bottom":2650,"safeRadius":117.5},{"x":2712.5,"y":2507.81,"top":2365.63,"bottom":2650,"safeRadius":117.5},{"x":2725,"y":2506.25,"top":2362.5,"bottom":2650,"safeRadius":119.57},{"x":2737.5,"y":2503.13,"top":2356.25,"bottom":2650,"safeRadius":116.75},{"x":2750,"y":2500,"top":2350,"bottom":2650,"safeRadius":110.1},{"x":2762.5,"y":2500,"top":2350,"bottom":2650,"safeRadius":105.96},{"x":2775,"y":2507.81,"top":2359.38,"bottom":2656.25,"safeRadius":109.32},{"x":2787.5,"y":2518.75,"top":2378.13,"bottom":2659.38,"safeRadius":112.68},{"x":2800,"y":2523.44,"top":2387.5,"bottom":2659.38,"safeRadius":112.5},{"x":2812.5,"y":2528.13,"top":2390.63,"bottom":2665.63,"safeRadius":107.78},{"x":2825,"y":2528.13,"top":2390.63,"bottom":2665.63,"safeRadius":103.64},{"x":2837.5,"y":2526.56,"top":2387.5,"bottom":2665.63,"safeRadius":99.5},{"x":2850,"y":2518.75,"top":2381.25,"bottom":2656.25,"safeRadius":102.86},{"x":2862.5,"y":2512.5,"top":2378.13,"bottom":2646.88,"safeRadius":103.71},{"x":2875,"y":2503.13,"top":2371.88,"bottom":2634.38,"safeRadius":107.07},{"x":2887.5,"y":2493.75,"top":2359.38,"bottom":2628.13,"safeRadius":103.71},{"x":2900,"y":2481.25,"top":2340.63,"bottom":2621.88,"safeRadius":97.86},{"x":2912.5,"y":2471.88,"top":2325,"bottom":2618.75,"safeRadius":94.5},{"x":2925,"y":2467.19,"top":2315.63,"bottom":2618.75,"safeRadius":96.14},{"x":2937.5,"y":2467.19,"top":2312.5,"bottom":2621.88,"safeRadius":100.28},{"x":2950,"y":2468.75,"top":2312.5,"bottom":2625,"safeRadius":104.42},{"x":2962.5,"y":2468.75,"top":2315.63,"bottom":2621.88,"safeRadius":108.57},{"x":2975,"y":2464.06,"top":2315.63,"bottom":2612.5,"safeRadius":110.96},{"x":2987.5,"y":2456.25,"top":2312.5,"bottom":2600,"safeRadius":114.32},{"x":3000,"y":2448.44,"top":2306.25,"bottom":2590.63,"safeRadius":115.18},{"x":3012.5,"y":2442.19,"top":2300,"bottom":2584.38,"safeRadius":116.04},{"x":3025,"y":2434.38,"top":2287.5,"bottom":2581.25,"safeRadius":112.86},{"x":3037.5,"y":2431.25,"top":2284.38,"bottom":2578.13,"safeRadius":114.5},{"x":3050,"y":2429.69,"top":2281.25,"bottom":2578.13,"safeRadius":118.64},{"x":3062.5,"y":2428.13,"top":2278.13,"bottom":2578.13,"safeRadius":120.28},{"x":3075,"y":2425,"top":2271.88,"bottom":2578.13,"safeRadius":116.67},{"x":3087.5,"y":2421.88,"top":2265.63,"bottom":2578.13,"safeRadius":114.6},{"x":3100,"y":2410.94,"top":2246.88,"bottom":2575,"safeRadius":115.64},{"x":3112.5,"y":2404.69,"top":2237.5,"bottom":2571.88,"safeRadius":113.14},{"x":3125,"y":2396.88,"top":2231.25,"bottom":2562.5,"safeRadius":113.14},{"x":3137.5,"y":2389.06,"top":2225,"bottom":2553.13,"safeRadius":112.1},{"x":3150,"y":2378.13,"top":2212.5,"bottom":2543.75,"safeRadius":111.49},{"x":3162.5,"y":2364.06,"top":2193.75,"bottom":2534.38,"safeRadius":107.53},{"x":3175,"y":2346.88,"top":2168.75,"bottom":2525,"safeRadius":101.49},{"x":3187.5,"y":2331.25,"top":2143.75,"bottom":2518.75,"safeRadius":101.49},{"x":3200,"y":2318.75,"top":2128.13,"bottom":2509.38,"safeRadius":97.96},{"x":3212.5,"y":2310.94,"top":2121.88,"bottom":2500,"safeRadius":97.96},{"x":3225,"y":2304.69,"top":2115.63,"bottom":2493.75,"safeRadius":97.96},{"x":3237.5,"y":2296.88,"top":2109.38,"bottom":2484.38,"safeRadius":100.46},{"x":3250,"y":2289.06,"top":2096.88,"bottom":2481.25,"safeRadius":106.07},{"x":3262.5,"y":2275,"top":2071.88,"bottom":2478.13,"safeRadius":108.99},{"x":3275,"y":2264.06,"top":2050,"bottom":2478.13,"safeRadius":114.6},{"x":3287.5,"y":2251.56,"top":2028.13,"bottom":2475,"safeRadius":120.21},{"x":3300,"y":2248.44,"top":2025,"bottom":2471.88,"safeRadius":128.74},{"x":3312.5,"y":2245.31,"top":2021.88,"bottom":2468.75,"safeRadius":134.35},{"x":3325,"y":2242.19,"top":2021.88,"bottom":2462.5,"safeRadius":135.46},{"x":3337.5,"y":2235.94,"top":2018.75,"bottom":2453.13,"safeRadius":136.32},{"x":3350,"y":2228.13,"top":2015.63,"bottom":2440.63,"safeRadius":134.35},{"x":3362.5,"y":2215.63,"top":2012.5,"bottom":2418.75,"safeRadius":133.31},{"x":3375,"y":2203.13,"top":2006.25,"bottom":2400,"safeRadius":137.28},{"x":3387.5,"y":2193.75,"top":2000,"bottom":2387.5,"safeRadius":133.64},{"x":3400,"y":2184.38,"top":1990.63,"bottom":2378.13,"safeRadius":126.75},{"x":3412.5,"y":2176.56,"top":1981.25,"bottom":2371.88,"safeRadius":118.82},{"x":3425,"y":2171.88,"top":1971.88,"bottom":2371.88,"safeRadius":110.89},{"x":3437.5,"y":2167.19,"top":1962.5,"bottom":2371.88,"safeRadius":101.92},{"x":3450,"y":2167.19,"top":1959.38,"bottom":2375,"safeRadius":91.92},{"x":3462.5,"y":2165.63,"top":1953.13,"bottom":2378.13,"safeRadius":87.35},{"x":3475,"y":2162.5,"top":1946.88,"bottom":2378.13,"safeRadius":83.82},{"x":3487.5,"y":2151.56,"top":1931.25,"bottom":2371.88,"safeRadius":85.71},{"x":3500,"y":2129.69,"top":1909.38,"bottom":2350,"safeRadius":97.96},{"x":3512.5,"y":2103.13,"top":1900,"bottom":2306.25,"safeRadius":98.99},{"x":3525,"y":2075,"top":1893.75,"bottom":2256.25,"safeRadius":106.07},{"x":3537.5,"y":2064.06,"top":1890.63,"bottom":2237.5,"safeRadius":108.99},{"x":3550,"y":2059.38,"top":1887.5,"bottom":2231.25,"safeRadius":109.85},{"x":3562.5,"y":2056.25,"top":1887.5,"bottom":2225,"safeRadius":108.21},{"x":3575,"y":2048.44,"top":1878.13,"bottom":2218.75,"safeRadius":109.07},{"x":3587.5,"y":2039.06,"top":1875,"bottom":2203.13,"safeRadius":109.6},{"x":3600,"y":2029.69,"top":1875,"bottom":2184.38,"safeRadius":104.25},{"x":3612.5,"y":2025,"top":1881.25,"bottom":2168.75,"safeRadius":95.1},{"x":3625,"y":2029.69,"top":1896.88,"bottom":2162.5,"safeRadius":95.96},{"x":3637.5,"y":2032.81,"top":1909.38,"bottom":2156.25,"safeRadius":94.32},{"x":3650,"y":2037.5,"top":1921.88,"bottom":2153.13,"safeRadius":90.53},{"x":3662.5,"y":2040.63,"top":1931.25,"bottom":2150,"safeRadius":83.89},{"x":3675,"y":2037.5,"top":1934.38,"bottom":2140.63,"safeRadius":82.25},{"x":3687.5,"y":2031.25,"top":1931.25,"bottom":2131.25,"safeRadius":77.78},{"x":3700,"y":2026.56,"top":1928.13,"bottom":2125,"safeRadius":70.71},{"x":3712.5,"y":2025,"top":1928.13,"bottom":2121.88,"safeRadius":62.6},{"x":3725,"y":2031.25,"top":1940.63,"bottom":2121.88,"safeRadius":63.03},{"x":3737.5,"y":2039.06,"top":1950,"bottom":2128.13,"safeRadius":66.39},{"x":3750,"y":2046.88,"top":1962.5,"bottom":2131.25,"safeRadius":67.25},{"x":3762.5,"y":2056.25,"top":1971.88,"bottom":2140.63,"safeRadius":68.28},{"x":3775,"y":2062.5,"top":1975,"bottom":2150,"safeRadius":67.43},{"x":3787.5,"y":2070.31,"top":1978.13,"bottom":2162.5,"safeRadius":64.07},{"x":3800,"y":2082.81,"top":1981.25,"bottom":2184.38,"safeRadius":59.07},{"x":3812.5,"y":2089.06,"top":1978.13,"bottom":2200,"safeRadius":60.1},{"x":3825,"y":2092.19,"top":1975,"bottom":2209.38,"safeRadius":63.64},{"x":3837.5,"y":2096.88,"top":1971.88,"bottom":2221.88,"safeRadius":69.68},{"x":3850,"y":2100,"top":1965.63,"bottom":2234.38,"safeRadius":74.25},{"x":3862.5,"y":2100,"top":1959.38,"bottom":2240.63,"safeRadius":83.82},{"x":3875,"y":2103.13,"top":1959.38,"bottom":2246.88,"safeRadius":90.89},{"x":3887.5,"y":2104.69,"top":1956.25,"bottom":2253.13,"safeRadius":97.96},{"x":3900,"y":2109.38,"top":1956.25,"bottom":2262.5,"safeRadius":97.96},{"x":3912.5,"y":2114.06,"top":1962.5,"bottom":2265.63,"safeRadius":95.46},{"x":3925,"y":2121.88,"top":1971.88,"bottom":2271.88,"safeRadius":94.42},{"x":3937.5,"y":2129.69,"top":1984.38,"bottom":2275,"safeRadius":96.92},{"x":3950,"y":2140.63,"top":2000,"bottom":2281.25,"safeRadius":95.46},{"x":3962.5,"y":2148.44,"top":2009.38,"bottom":2287.5,"safeRadius":94.42},{"x":3975,"y":2156.25,"top":2021.88,"bottom":2290.63,"safeRadius":88.39},{"x":3987.5,"y":2159.38,"top":2028.13,"bottom":2290.63,"safeRadius":84.85},{"x":4000,"y":2165.63,"top":2040.63,"bottom":2290.63,"safeRadius":85.28},{"x":4012.5,"y":2168.75,"top":2046.88,"bottom":2290.63,"safeRadius":83.64},{"x":4025,"y":2173.44,"top":2053.13,"bottom":2293.75,"safeRadius":84.5},{"x":4037.5,"y":2182.81,"top":2065.63,"bottom":2300,"safeRadius":87.86},{"x":4050,"y":2193.75,"top":2081.25,"bottom":2306.25,"safeRadius":91.21},{"x":4062.5,"y":2203.13,"top":2090.63,"bottom":2315.63,"safeRadius":88.89},{"x":4075,"y":2207.81,"top":2093.75,"bottom":2321.88,"safeRadius":88.03},{"x":4087.5,"y":2210.94,"top":2093.75,"bottom":2328.13,"safeRadius":89.68},{"x":4100,"y":2218.75,"top":2093.75,"bottom":2343.75,"safeRadius":88.82},{"x":4112.5,"y":2228.13,"top":2087.5,"bottom":2368.75,"safeRadius":86.32},{"x":4125,"y":2232.81,"top":2087.5,"bottom":2378.13,"safeRadius":87.35},{"x":4137.5,"y":2235.94,"top":2087.5,"bottom":2384.38,"safeRadius":90.71},{"x":4150,"y":2237.5,"top":2087.5,"bottom":2387.5,"safeRadius":94.85},{"x":4162.5,"y":2242.19,"top":2090.63,"bottom":2393.75,"safeRadius":95.46},{"x":4175,"y":2250,"top":2096.88,"bottom":2403.13,"safeRadius":97.96},{"x":4187.5,"y":2268.75,"top":2106.25,"bottom":2431.25,"safeRadius":95.46},{"x":4200,"y":2282.81,"top":2118.75,"bottom":2446.88,"safeRadius":99.85},{"x":4212.5,"y":2289.06,"top":2128.13,"bottom":2450,"safeRadius":101.14},{"x":4225,"y":2292.19,"top":2134.38,"bottom":2450,"safeRadius":102.78},{"x":4237.5,"y":2293.75,"top":2137.5,"bottom":2450,"safeRadius":106.92},{"x":4250,"y":2292.19,"top":2137.5,"bottom":2446.88,"safeRadius":111.07},{"x":4262.5,"y":2289.06,"top":2134.38,"bottom":2443.75,"safeRadius":119.17},{"x":4275,"y":2287.5,"top":2131.25,"bottom":2443.75,"safeRadius":126.24},{"x":4287.5,"y":2290.63,"top":2134.38,"bottom":2446.88,"safeRadius":127.5},{"x":4300,"y":2287.5,"top":2131.25,"bottom":2443.75,"safeRadius":128.54},{"x":4312.5,"y":2282.81,"top":2125,"bottom":2440.63,"safeRadius":128.54},{"x":4325,"y":2275,"top":2112.5,"bottom":2437.5,"safeRadius":126.82},{"x":4337.5,"y":2270.31,"top":2106.25,"bottom":2434.38,"safeRadius":128.46},{"x":4350,"y":2267.19,"top":2100,"bottom":2434.38,"safeRadius":130.1},{"x":4362.5,"y":2265.63,"top":2093.75,"bottom":2437.5,"safeRadius":131.75},{"x":4375,"y":2264.06,"top":2087.5,"bottom":2440.63,"safeRadius":135.89},{"x":4387.5,"y":2264.06,"top":2084.38,"bottom":2443.75,"safeRadius":136.24},{"x":4400,"y":2262.5,"top":2078.13,"bottom":2446.88,"safeRadius":134.6},{"x":4412.5,"y":2260.94,"top":2075,"bottom":2446.88,"safeRadius":130.46},{"x":4425,"y":2256.25,"top":2065.63,"bottom":2446.88,"safeRadius":131.32},{"x":4437.5,"y":2245.31,"top":2046.88,"bottom":2443.75,"safeRadius":134.68},{"x":4450,"y":2226.56,"top":2021.88,"bottom":2431.25,"safeRadius":137.89},{"x":4462.5,"y":2206.25,"top":2000,"bottom":2412.5,"safeRadius":125.1},{"x":4475,"y":2196.88,"top":1993.75,"bottom":2400,"safeRadius":121.75},{"x":4487.5,"y":2189.06,"top":1987.5,"bottom":2390.63,"safeRadius":120.89},{"x":4500,"y":2181.25,"top":1978.13,"bottom":2384.38,"safeRadius":117.53},{"x":4512.5,"y":2171.88,"top":1959.38,"bottom":2384.38,"safeRadius":114.6},{"x":4525,"y":2156.25,"top":1931.25,"bottom":2381.25,"safeRadius":112.1},{"x":4537.5,"y":2148.44,"top":1918.75,"bottom":2378.13,"safeRadius":118.14},{"x":4550,"y":2140.63,"top":1906.25,"bottom":2375,"safeRadius":123.14},{"x":4562.5,"y":2137.5,"top":1903.13,"bottom":2371.88,"safeRadius":132.1},{"x":4575,"y":2132.81,"top":1900,"bottom":2365.63,"safeRadius":139.35},{"x":4587.5,"y":2123.44,"top":1890.63,"bottom":2356.25,"safeRadius":133.82},{"x":4600,"y":2109.38,"top":1871.88,"bottom":2346.88,"safeRadius":128.99},{"x":4612.5,"y":2098.44,"top":1859.38,"bottom":2337.5,"safeRadius":122.1},{"x":4625,"y":2085.94,"top":1850,"bottom":2321.88,"safeRadius":116.67},{"x":4637.5,"y":2076.56,"top":1843.75,"bottom":2309.38,"safeRadius":112.1},{"x":4650,"y":2067.19,"top":1840.63,"bottom":2293.75,"safeRadius":109.6},{"x":4662.5,"y":2062.5,"top":1837.5,"bottom":2287.5,"safeRadius":107.53},{"x":4675,"y":2060.94,"top":1837.5,"bottom":2284.38,"safeRadius":102.53},{"x":4687.5,"y":2060.94,"top":1840.63,"bottom":2281.25,"safeRadius":98.39},{"x":4700,"y":2056.25,"top":1843.75,"bottom":2268.75,"safeRadius":99.25},{"x":4712.5,"y":2045.31,"top":1846.88,"bottom":2243.75,"safeRadius":102.6},{"x":4725,"y":2018.75,"top":1846.88,"bottom":2190.63,"safeRadius":120.96},{"x":4737.5,"y":2007.81,"top":1846.88,"bottom":2168.75,"safeRadius":124.32},{"x":4750,"y":1998.44,"top":1840.63,"bottom":2156.25,"safeRadius":127.68},{"x":4762.5,"y":1992.19,"top":1834.38,"bottom":2150,"safeRadius":128.54},{"x":4775,"y":1984.38,"top":1821.88,"bottom":2146.88,"safeRadius":125.96},{"x":4787.5,"y":1981.25,"top":1815.63,"bottom":2146.88,"safeRadius":127.6},{"x":4796.88,"y":1976.56,"top":1806.25,"bottom":2146.88,"safeRadius":128.21}],"length":5728.5,"minConservativeRadius":59.1,"verticalSpan":650}],"entryApron":{"x":-600,"width":600},"exitApron":{"x":4800,"width":600},"camera":{"referenceShortSide":900,"smoothTimeSeconds":0.55,"verticalDeadZone":0.14,"lookAheadX":180,"maxSpeedY":280,"lockWorldAxes":true},"collision":{"file":"collision/p2_collision.png","thresholdAlpha":96,"note":"white=solid, black=water. Route safeRadius is conservative chamfer estimate, not final physics."},"dust":[{"x":150,"y":2127.38},{"x":425,"y":1910.13},{"x":700,"y":1983.63},{"x":975,"y":1866.38},{"x":1250,"y":2402.38},{"x":1525,"y":2216.38},{"x":1800,"y":2293},{"x":2075,"y":1975.75},{"x":2350,"y":2468},{"x":2625,"y":2341.38},{"x":2900,"y":2589.88},{"x":3175,"y":2200.75},{"x":3450,"y":2343},{"x":3725,"y":1972.63},{"x":4000,"y":2258.63},{"x":4275,"y":2163.25},{"x":4550,"y":2343}]};
  var P2_IMAGE_FILES = {
  "base": "assets/images/p2_base.webp",
  "far": "assets/images/p2_channels_far.webp",
  "reef": "assets/images/p2_channels_reef.webp",
  "front": "assets/images/p2_overhang.webp"
};

  resetPhase2();resetPhase3();resetPhase4();
  resize();
  requestAnimationFrame(function (now) {
    last = now;
    requestAnimationFrame(tick);
  });
})();
