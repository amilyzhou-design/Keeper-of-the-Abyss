/* ============================================
   深渊牧光者 · 开屏粒子背景
   深海微光粒子：每颗粒子以 3–6 秒的随机周期
   缓慢呼吸明暗，少量青蓝色粒子带光晕。
   纯原生 Canvas，无外部依赖。
   ============================================ */

(function () {
  "use strict";

  var canvas = document.getElementById("sea");
  var ctx = canvas.getContext("2d");

  var W = 0;          // CSS 像素宽
  var H = 0;          // CSS 像素高
  var dpr = 1;
  var particles = [];

  // 鼠标位置（EMA 平滑后的牵引中心）
  var mouse = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  var GATHER_RADIUS = 200;   // 聚集影响半径（像素）
  var GATHER_PULL = 26;      // 聚集牵引强度（像素 / 秒，边缘衰减到 0）

  /* ---------- 工具函数 ---------- */
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /* ---------- 粒子定义 ---------- */
  function createParticle() {
    // 约 15% 是较大的青蓝色发光粒子，其余为白色小点
    var isBlue = Math.random() < 0.15;

    return {
      x: Math.random() * W,
      y: Math.random() * H,

      // 半径：白点小而细，蓝点稍大并带光晕
      radius: isBlue ? rand(1.3, 2.6) : rand(0.5, 1.4),
      isBlue: isBlue,

      // 基准亮度（呼吸时的峰值）
      baseAlpha: isBlue ? rand(0.65, 1.0) : rand(0.4, 0.95),

      // 呼吸参数：周期 3–6 秒随机，相位随机，互不同步
      period: rand(3000, 6000),          // 毫秒
      phase: Math.random() * Math.PI * 2,

      // 漂浮：基础漂移速度 + 缓慢的转向摆动，像在水中悬浮
      vx: rand(-9, 9),                   // 像素 / 秒
      vy: rand(-7, 7),
      driftPhase: Math.random() * Math.PI * 2,   // 转向摆动相位
      driftPeriod: rand(6000, 12000)     // 转向摆动周期（毫秒）
    };
  }

  /* ---------- 画布尺寸 / 粒子数量 ---------- */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 密度：约每 12000 平方像素一颗，明显多于初版
    var target = Math.round((W * H) / 12000);
    target = Math.max(60, Math.min(220, target));

    while (particles.length < target) particles.push(createParticle());
    particles.length = target;
  }

  /* ---------- 单颗粒子绘制 ---------- */
  function drawParticle(p, now) {
    // 呼吸：正弦波，亮度在 25% ~ 100% 之间起伏
    var wave = 0.5 + 0.5 * Math.sin((now / p.period) * Math.PI * 2 + p.phase);
    var alpha = p.baseAlpha * (0.25 + 0.75 * wave);

    if (p.isBlue) {
      // 青蓝色粒子：先画一层径向渐变光晕，再画亮核
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
      // 白色微粒
      ctx.fillStyle = "rgba(226, 238, 250," + alpha.toFixed(3) + ")";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ---------- 主循环 ---------- */
  var last = 0;

  function tick(now) {
    var dt = Math.min((now - last) / 1000, 0.05); // 秒，防后台切回跳变
    last = now;

    ctx.clearRect(0, 0, W, H);

    // 牵引中心向真实鼠标位置平滑跟随（EMA），避免顿挫
    if (mouse.active) {
      mouse.x += (mouse.tx - mouse.x) * Math.min(dt * 6, 1);
      mouse.y += (mouse.ty - mouse.y) * Math.min(dt * 6, 1);
    }

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // 漂浮：基础速度叠加缓慢的转向摆动（正弦），运动更柔和自然
      var sway = (now / p.driftPeriod) * Math.PI * 2 + p.driftPhase;
      p.x += (p.vx + Math.cos(sway) * 4.5) * dt;
      p.y += (p.vy + Math.sin(sway) * 3.5) * dt;

      // 鼠标附近的轻微聚集：越靠近牵引力越强，柔和地向鼠标靠拢
      if (mouse.active) {
        var dx = mouse.x - p.x;
        var dy = mouse.y - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1 && dist < GATHER_RADIUS) {
          var pull = GATHER_PULL * (1 - dist / GATHER_RADIUS);
          pull *= pull / GATHER_PULL;   // 平方衰减，远处几乎不受影响
          p.x += (dx / dist) * pull * dt;
          p.y += (dy / dist) * pull * dt;
        }
      }

      if (p.x < -8) p.x = W + 8; else if (p.x > W + 8) p.x = -8;
      if (p.y < -8) p.y = H + 8; else if (p.y > H + 8) p.y = -8;

      drawParticle(p, now);
    }

    requestAnimationFrame(tick);
  }

  /* ---------- 启动 ---------- */
  resize();
  window.addEventListener("resize", resize);

  // 鼠标移动：更新牵引目标；移出窗口：停止聚集
  window.addEventListener("mousemove", function (e) {
    mouse.tx = e.clientX;
    mouse.ty = e.clientY;
    if (!mouse.active) {
      // 首次进入直接从当前位置开始，避免从 (0,0) 飞过来
      mouse.x = mouse.tx;
      mouse.y = mouse.ty;
      mouse.active = true;
    }
  });
  document.addEventListener("mouseleave", function () {
    mouse.active = false;
  });

  requestAnimationFrame(function (now) {
    last = now;
    requestAnimationFrame(tick);
  });
})();
