
(function(){
  'use strict';
  const ADR = window.ADR;
  const {clamp, lerp, rand, toast, AudioEngine, TouchStick, SpriteSheet, ParticleSystem, FPSCounter, Camera2D} = ADR;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // HUD
  const statEl = document.getElementById('stat');
  const moneyEl = document.getElementById('money');
  const fpsEl = document.getElementById('fps');
  const cdEl = document.getElementById('skillCD');

  // Buttons
  const startBtn = document.getElementById('startBtn');
  const skillBtn = document.getElementById('skillBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const soundBtn = document.getElementById('soundBtn');
  const weaponBtn = document.getElementById('weaponBtn');
  const shopBtn = document.getElementById('shopBtn');

  // Panels
  const menuPanel = document.getElementById('menuPanel');
  const shopPanel = document.getElementById('shopPanel');
  const saveInfo = document.getElementById('saveInfo');
  const newGameBtn = document.getElementById('newGameBtn');
  const continueBtn = document.getElementById('continueBtn');
  const openShopBtn = document.getElementById('openShopBtn');
  const closeShopBtn = document.getElementById('closeShopBtn');
  const resetSaveBtn = document.getElementById('resetSaveBtn');

  const mapCityBtn = document.getElementById('mapCityBtn');
  const mapNightBtn = document.getElementById('mapNightBtn');
  const mapRuinsBtn = document.getElementById('mapRuinsBtn');
  const mapToxicBtn = document.getElementById('mapToxicBtn');

  // Skin buttons
  const skinRedBtn = document.getElementById('skinRedBtn');
  const skinGreenBtn = document.getElementById('skinGreenBtn');
  const skinGoldBtn = document.getElementById('skinGoldBtn');
  const skinDefaultBtn = document.getElementById('skinDefaultBtn');


  // Shop UI
  const shopCoins = document.getElementById('shopCoins');
  const upDmgBtn = document.getElementById('upDmgBtn');
  const upHpBtn = document.getElementById('upHpBtn');
  const upCritBtn = document.getElementById('upCritBtn');
  const unlockGunBtn = document.getElementById('unlockGunBtn');
  const upFireBtn = document.getElementById('upFireBtn');
  const upRegenBtn = document.getElementById('upRegenBtn');

  const costDmgEl = document.getElementById('costDmg');
  const costHpEl = document.getElementById('costHp');
  const costCritEl = document.getElementById('costCrit');
  const costGunEl = document.getElementById('costGun');
  const costFireEl = document.getElementById('costFire');
  const costRegenEl = document.getElementById('costRegen');

  // ===== DPI resize =====
  let W=0,H=0,DPR=1;
  function resize(){
    DPR = Math.min(2, window.devicePixelRatio||1);
    const w = Math.max(1, Math.floor(innerWidth*DPR));
    const h = Math.max(1, Math.floor(innerHeight*DPR));
    if(canvas.width!==w || canvas.height!==h){
      canvas.width=w; canvas.height=h;
    }
    W=canvas.width; H=canvas.height;
  }
  resize();
  window.addEventListener('resize', resize);

  // ===== Save =====
  const SAVE_KEY = "aosz_save_v1";
  function loadSave(){
    try{
      const raw = localStorage.getItem(SAVE_KEY);
      if(!raw) return null;
      return JSON.parse(raw);
    }catch(e){ return null; }
  }
  function writeSave(s){
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(s)); }catch(e){}
  }
  function resetSave(){
    try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
  }

  // ===== Audio =====
  const audio = new AudioEngine();
  audio.loadBGM('bgm_main.mp3');
  audio.loadSFX('punch', 'punch.mp3');
  audio.enabled = true;

  if(soundBtn){
    soundBtn.onclick = ()=>{
      audio.enabled = !audio.enabled;
      toast(audio.enabled ? 'Sound ON' : 'Sound OFF', 900);
      if(!audio.enabled) audio.stopBGM();
      else if(state.mode==='game' && !state.paused) audio.playBGM();
    };
  }

  // ===== Input =====
  const stick = new TouchStick();
  stick.attach(canvas);

  // ===== FX =====
  const particles = new ParticleSystem();
  const fps = new FPSCounter();
  const cam = new Camera2D();

  // ===== Assets =====
  function loadImg(src){
    return new Promise((res, rej)=>{
      const i=new Image();
      i.onload=()=>res(i);
      i.onerror=()=>rej(new Error('Fail img: '+src));
      i.src=src;
    });
  }

  let logo, fxBlood, playerSheetImg, zombieSheetImg, playerSheet, zombieSheet;
  let bg = {far:null, mid:null, near:null};

  // ===== State =====
  const state = {
    mode: 'menu',
    skin: 'default', // menu | shop | game
    paused: false,
    map: 'city',
    runningRAF: false
  };

  // ===== Balance / Upgrades =====
  const upgrades = {
    dmg: 0,
    hp: 0,
    crit: 0,     // percent
    gun: 0,      // unlocked
    fire: 0,     // fire rate level
    regen: 0     // regen level
  };

  function costs(){
    return {
      dmg: 10 + upgrades.dmg*12,
      hp: 12 + upgrades.hp*14,
      crit: 15 + upgrades.crit*9,
      gun: 80,
      fire: 25 + upgrades.fire*20,
      regen: 30 + upgrades.regen*24
    };
  }

  // ===== Game objects =====
  const world = {
    t:0,
    scroll:0,
    wave:1,
    kills:0,
    coins:0,
    spawnAcc:0,
    bossAlive:false,
    bossHp:0,
    bossHpMax:0
  };

  const player = {
    x: 280, y: 0,
    vx: 0,
    w: 96, h: 160,
    hp: 100,
    hpMax: 100,
    face: 1,
    atkCD: 0,
    skillCD: 0,
    gunCD: 0,
    frame: 0,
    anim: 0,
    inv: 0,
    weapon: 'melee' // melee | gun
  };

  const enemies = [];
  const bullets = [];
  const bossBullets = [];
  const drops = []; // coins + blood (life negative)

  function floorY(){ return Math.floor(H*0.78); }

  function rectsOverlap(ax,ay,aw,ah, bx,by,bw,bh){
    return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
  }

  function spawnEnemy(type){
    const baseHP = 40 + world.wave*8;
    const e = {
      kind:'enemy',
      type, // walker | runner | tank | boss
      x: W + rand(0, 260),
      y: 0,
      w: 96, h: 160,
      hp: baseHP,
      vx: -rand(48, 92),
      frame: 0, anim: rand(0, 1),
      hit: 0,
      dmg: 7 + world.wave*0.6,
      coin: 1
    };
    if(type==='runner'){
      e.vx = -rand(110, 150);
      e.hp = baseHP*0.75;
      e.dmg *= 0.8;
      e.coin = 1;
    }else if(type==='tank'){
      e.vx = -rand(28, 55);
      e.hp = baseHP*1.8;
      e.dmg *= 1.25;
      e.coin = 3;
      e.w = 112; e.h = 170;
    }else if(type==='boss'){
      e.vx = -rand(26, 40);
      e.hp = baseHP * 7.5;
      e.dmg *= 2.2;
      e.coin = 12;
      e.w = 160; e.h = 220;
      world.bossAlive = true;
      world.bossHp = e.hp;
      world.bossHpMax = e.hp;
    }
    enemies.push(e);
  }

  function spawnWaveMix(){
    if(world.bossAlive) return;
    // Boss every 5 waves
    if(world.wave % 5 === 0 && enemies.filter(e=>e.type==='boss' && e.hp>0).length===0){
      spawnEnemy('boss');
      toast('BOSS INCOMING!', 1400);
      cam.shake(22, 0.24);
      return;
    }
    const r = Math.random();
    if(world.wave >= 3 && r < 0.15) return spawnEnemy('tank');
    if(world.wave >= 2 && r < 0.55) return spawnEnemy('runner');
    return spawnEnemy('walker');
  }

  function dropCoins(x,y,n=1){
    for(let i=0;i<n;i++){
      drops.push({
        x: x + rand(-12, 12),
        y: y + rand(-10, 10),
        vx: rand(-110, 110),
        vy: rand(-260, -140),
        life: rand(0.8, 1.5),
        t: 0,
        kind:'coin'
      });
    }
  }

  function bloodBurst(x,y,count=6){
    for(let i=0;i<count;i++){
      drops.push({
        x: x + rand(-10,10),
        y: y + rand(-10,10),
        vx: rand(-240, 240),
        vy: rand(-360, -120),
        life: -rand(0.25, 0.55),
        t: 0,
        kind:'blood'
      });
    }
  }

  function critRoll(){
    const p = clamp((upgrades.crit*2) / 100, 0, 0.45);
    return Math.random() < p;
  }

  function meleeDamage(){
    let dmg = 18 + world.wave*2 + upgrades.dmg*1.0;
    if(critRoll()) dmg *= 1.6;
    return dmg;
  }

  function gunDamage(){
    let dmg = 8 + world.wave*1.1 + upgrades.dmg*0.6;
    if(critRoll()) dmg *= 1.5;
    return dmg;
  }

  function doAttack(){
    if(player.atkCD>0 || player.weapon!=='melee') return;
    player.atkCD = 0.28;
    audio.playSFX('punch');
    cam.shake(10, 0.14);
    particles.burst(player.x + player.w*0.8, player.y + player.h*0.55, 18);

    const hitBox = {
      x: player.face>0 ? player.x + player.w*0.65 : player.x - player.w*0.25,
      y: player.y + player.h*0.25,
      w: player.w*0.62,
      h: player.h*0.45
    };

    let hitAny=false;
    for(const e of enemies){
      if(e.hp<=0) continue;
      if(rectsOverlap(hitBox.x,hitBox.y,hitBox.w,hitBox.h, e.x, e.y, e.w, e.h)){
        const dmg = meleeDamage();
        e.hp -= dmg;
        e.hit = 0.12;
        hitAny=true;
        bloodBurst(e.x+e.w*0.55, e.y+e.h*0.55, 6);
        if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }
 world.bossHp = Math.max(0, e.hp); }

        if(e.hp<=0){
          world.kills++;
          cam.shake(16, 0.18);
          particles.burst(e.x + e.w*0.5, e.y + e.h*0.55, 28);
          dropCoins(e.x + e.w*0.5, e.y + e.h*0.45, e.coin);
          if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }

            world.bossAlive = false;
            toast('BOSS DOWN!', 1500);
          }
        }
      }
    }
    if(!hitAny) toast('Miss!', 520);
  }

  function shoot(){
    if(!upgrades.gun || player.weapon!=='gun') return;
    if(player.gunCD>0) return;
    const rate = 0.22 - upgrades.fire*0.02; // lower is faster
    player.gunCD = clamp(rate, 0.08, 0.22);
    cam.shake(6, 0.08);

    const bx = player.face>0 ? player.x+player.w*0.75 : player.x+player.w*0.25;
    const by = player.y+player.h*0.45;
    bullets.push({
      x: bx, y: by,
      vx: (player.face>0 ? 1 : -1) * (720 + upgrades.fire*90),
      life: 1.1
    });
  }

  function doSkill(){
    if(player.skillCD>0) return;
    player.skillCD = 6.0;
    audio.playSFX('punch');
    toast('Skill: Shockwave', 900);
    cam.shake(20, 0.22);
    particles.burst(player.x + player.w*0.5, player.y + player.h*0.6, 54);

    for(const e of enemies){
      if(e.hp<=0) continue;
      const dist = Math.abs((e.x+e.w*0.5) - (player.x+player.w*0.5));
      if(dist < 340){
        e.hp -= 14 + world.wave*2 + upgrades.dmg*0.5;
        e.hit = 0.18;
        bloodBurst(e.x+e.w*0.55, e.y+e.h*0.55, 6);
        if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }
 world.bossHp = Math.max(0, e.hp); }
        if(e.hp<=0){
          world.kills++;
          dropCoins(e.x + e.w*0.5, e.y + e.h*0.45, e.coin);
          if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }

            world.bossAlive = false;
            toast('BOSS DOWN!', 1500);
          }
        }
      }
    }
  }

  // ===== UI bindings =====
  startBtn.onclick = ()=>{
    if(state.mode!=='game'){
      startGame(false);
      return;
    }
    state.paused = false;
    audio.playBGM();
  };

  pauseBtn.onclick = ()=>{
    if(state.mode!=='game') return;
    state.paused = !state.paused;
    if(state.paused){
      audio.stopBGM();
      toast('Paused', 900);
    }else{
      audio.playBGM();
    }
  };

  skillBtn.onclick = ()=>{
    if(state.mode!=='game') return;
    if(player.skillCD>0){
      toast(`Skill CD: ${player.skillCD.toFixed(1)}s`, 900);
      return;
    }
    doSkill();
  };

  if(weaponBtn){
    weaponBtn.onclick = ()=>{
      if(!upgrades.gun){
        toast('Gun locked (Shop)', 900);
        return;
      }
      player.weapon = (player.weapon==='melee') ? 'gun' : 'melee';
      toast('Weapon: ' + player.weapon.toUpperCase(), 900);
    };
  }

  if(shopBtn){
    shopBtn.onclick = ()=>{
      if(state.mode==='game'){
        openShop();
      }else{
        openShop(true);
      }
    };
  }

  // Tap/click: melee attack or gun shoot
  canvas.addEventListener('click', ()=>{
    if(state.mode!=='game' || state.paused) return;
    if(player.weapon==='gun') shoot();
    else doAttack();
  });

  let lastTap=0;
  canvas.addEventListener('touchend', (e)=>{
    const t=performance.now();
    if(state.mode!=='game' || state.paused) return;
    if(t-lastTap < 280){
      doSkill();
    }else{
      if(player.weapon==='gun') shoot();
      else doAttack();
    }
    lastTap=t;
  }, {passive:true});

  // ===== Menu / Shop =====
  function showMenu(on){
    state.mode = on ? 'menu' : state.mode;
    if(menuPanel) menuPanel.style.display = on ? 'flex' : 'none';
  }
  function showShop(on){
    if(shopPanel) shopPanel.style.display = on ? 'flex' : 'none';
  }

  function applySave(s){
    if(!s) return;
    upgrades.dmg = s.up?.dmg||0;
    upgrades.hp = s.up?.hp||0;
    upgrades.crit = s.up?.crit||0;
    upgrades.gun = s.up?.gun||0;
    upgrades.fire = s.up?.fire||0;
    upgrades.regen = s.up?.regen||0;

    world.wave = s.world?.wave||1;
    world.kills = s.world?.kills||0;
    world.coins = s.world?.coins||0;
    state.map = s.map || 'city';
    state.skin = s.skin || 'default';
  }

  function makeSave(){
    return {
      map: state.map,
      skin: state.skin,
      up: {...upgrades},
      world: { wave: world.wave, kills: world.kills, coins: world.coins }
    };
  }

  function refreshSaveInfo(){
    const s = loadSave();
    if(saveInfo){
      if(!s) saveInfo.textContent = "Save: none";
      else saveInfo.textContent = `Save: Wave ${s.world?.wave||1} • Coins ${s.world?.coins||0} • Map ${s.map||'city'}`;
    }
    if(continueBtn) continueBtn.disabled = !s;
  }

  function openShop(fromMenu=false){
    state.mode = fromMenu ? 'shop' : state.mode;
    showShop(true);
    showMenu(false);
    renderShop();
  }
  function closeShop(){
    showShop(false);
    if(state.mode==='shop'){
      showMenu(true);
      state.mode='menu';
    }
  }

  if(openShopBtn) openShopBtn.onclick = ()=> openShop(true);
  if(closeShopBtn) closeShopBtn.onclick = ()=> closeShop();
  if(resetSaveBtn) resetSaveBtn.onclick = ()=>{
    resetSave();
    toast('Save reset', 900);
    refreshSaveInfo();
  };

  function renderShop(){
    const c = costs();
    if(costDmgEl) costDmgEl.textContent = c.dmg;
    if(costHpEl) costHpEl.textContent = c.hp;
    if(costCritEl) costCritEl.textContent = c.crit;
    if(costGunEl) costGunEl.textContent = c.gun;
    if(costFireEl) costFireEl.textContent = c.fire;
    if(costRegenEl) costRegenEl.textContent = c.regen;

    if(shopCoins) shopCoins.textContent = `Coins: ${world.coins}`;
    if(unlockGunBtn) unlockGunBtn.disabled = !!upgrades.gun;
  }

  function buy(cost){
    if(world.coins < cost){
      toast('Not enough coins', 900);
      return false;
    }
    world.coins -= cost;
    toast('-' + cost + ' coins', 700);
    return true;
  }

  function onUpgrade(){
    writeSave(makeSave());
    renderShop();
  }

  if(upDmgBtn) upDmgBtn.onclick = ()=>{
    const c = costs().dmg;
    if(buy(c)){ upgrades.dmg++; onUpgrade(); }
  };
  if(upHpBtn) upHpBtn.onclick = ()=>{
    const c = costs().hp;
    if(buy(c)){ upgrades.hp++; onUpgrade(); player.hpMax = 100 + upgrades.hp*10; player.hp = clamp(player.hp+10, 0, player.hpMax); }
  };
  if(upCritBtn) upCritBtn.onclick = ()=>{
    const c = costs().crit;
    if(buy(c)){ upgrades.crit++; onUpgrade(); }
  };
  if(unlockGunBtn) unlockGunBtn.onclick = ()=>{
    const c = costs().gun;
    if(buy(c)){ upgrades.gun=1; onUpgrade(); toast('Gun unlocked!', 900); }
  };
  if(upFireBtn) upFireBtn.onclick = ()=>{
    const c = costs().fire;
    if(buy(c)){ upgrades.fire++; onUpgrade(); }
  };
  if(upRegenBtn) upRegenBtn.onclick = ()=>{
    const c = costs().regen;
    if(buy(c)){ upgrades.regen++; onUpgrade(); }
  };

  // Map selection
  function setMap(m){
    state.map = m;
    toast('Map: '+m, 900);
    writeSave(makeSave());
  }
  if(mapCityBtn) mapCityBtn.onclick = ()=> setMap('city');
  if(mapNightBtn) mapNightBtn.onclick = ()=> setMap('night');
  if(mapRuinsBtn) mapRuinsBtn.onclick = ()=> setMap('ruins');
  if(mapToxicBtn) mapToxicBtn.onclick = ()=> setMap('toxic');

  if(newGameBtn) newGameBtn.onclick = ()=> startGame(true);
  if(continueBtn) continueBtn.onclick = ()=> startGame(false);

  // ===== Drawing =====
  function drawLayer(img, speed, alpha=1){
    const s = (world.scroll*speed) % img.width;
    const scale = H / img.height;
    const dw = img.width*scale;
    const dh = H;
    let x0 = -s*scale;
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.drawImage(img, x0, 0, dw, dh);
    ctx.drawImage(img, x0 + dw, 0, dw, dh);
    ctx.restore();
  }

  function drawHUD(){
    const hp = Math.max(0, Math.floor(player.hp));
    statEl.textContent = `HP ${hp}/${player.hpMax} | Wave ${world.wave} | Kills ${world.kills}`;
    if(moneyEl) moneyEl.textContent = `Coins ${world.coins}`;
    fpsEl.textContent = `FPS ${fps.fps}`;

    if(cdEl){
      const pct = clamp((6.0 - player.skillCD) / 6.0, 0, 1);
      cdEl.style.width = (pct*100).toFixed(1) + '%';
    }

    // Boss bar
    if(world.bossAlive){
      const bw = W*0.42;
      const bh = 12*DPR;
      const x = (W-bw)/2;
      const y = 12*DPR + 44*DPR;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = "rgba(255,80,100,0.95)";
      const p = world.bossHpMax>0 ? (world.bossHp/world.bossHpMax) : 0;
      ctx.fillRect(x, y, bw*clamp(p,0,1), bh);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `${Math.floor(12*DPR)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText("BOSS", x+bw/2, y-4*DPR);
      ctx.restore();
    }
  }

  function update(dt){
    world.t += dt;
    world.scroll += 170*dt;
    cam.update(dt);

    // regen
    if(upgrades.regen>0 && player.hp>0){
      player.hp = clamp(player.hp + dt*(0.45 + upgrades.regen*0.25), 0, player.hpMax);
    }

    // spawn
    const alive = enemies.filter(e=>e.hp>0).length;
    const target = 2 + world.wave;
    world.spawnAcc += dt;
    if(!world.bossAlive && alive < target && world.spawnAcc > 0.32){
      world.spawnAcc = 0;
      spawnWaveMix();
    }

    // wave up
    if(world.kills >= world.wave*10){
      world.wave++;
      toast(`Wave ${world.wave}!`, 1100);
      writeSave(makeSave());
    }

    // ground
    const gy = floorY();
    player.y = gy - player.h;
    player.hpMax = 100 + upgrades.hp*10;

    // movement
    const speed = 270;
    player.vx = stick.dx * speed;
    if(Math.abs(player.vx) > 2){
      player.face = player.vx>=0 ? 1 : -1;
    }
    player.x += player.vx * dt;
    player.x = clamp(player.x, 30, W - player.w - 30);

    // cooldowns
    player.atkCD = Math.max(0, player.atkCD - dt);
    player.skillCD = Math.max(0, player.skillCD - dt);
    player.gunCD = Math.max(0, player.gunCD - dt);
    player.inv = Math.max(0, player.inv - dt);

    // bullets
    // boss bullets
    ctx.save();
    ctx.strokeStyle='rgba(255,80,120,0.9)';
    ctx.lineWidth=4*DPR;
    for(const b of bossBullets){
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx*0.03, b.y - b.vy*0.03);
      ctx.stroke();
    }
    ctx.restore();

    // bullets
    for(let i=bullets.length-1;i>=0;i--){
      const b=bullets[i];
      b.x += b.vx*dt;
      b.life -= dt;
      // hit enemies
      for(const e of enemies){
        if(e.hp<=0) continue;
        if(b.x > e.x && b.x < e.x+e.w && b.y > e.y && b.y < e.y+e.h){
          e.hp -= gunDamage();
          e.hit = 0.10;
          bloodBurst(b.x, b.y, 3);
          if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }
 world.bossHp = Math.max(0, e.hp); }
          bullets.splice(i,1);
          if(e.hp<=0){
            world.kills++;
            dropCoins(e.x + e.w*0.5, e.y + e.h*0.45, e.coin);
            if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }

              world.bossAlive = false;
              toast('BOSS DOWN!', 1500);
              writeSave(makeSave());
            }
          }
          break;
        }
      }
      if(i<bullets.length && b.life<=0) bullets.splice(i,1);
      if(i<bullets.length && (b.x<-50 || b.x>W+50)) bullets.splice(i,1);
    }

        // boss bullets
    for(let i=bossBullets.length-1;i>=0;i--){
      const b=bossBullets[i];
      b.x += b.vx*dt;
      b.y += b.vy*dt;
      b.life -= dt;
      if(player.hp>0 && player.inv<=0 && b.x>player.x && b.x<player.x+player.w && b.y>player.y && b.y<player.y+player.h){
        player.hp -= 14 + world.wave*0.7;
        player.inv = 0.22;
        cam.shake(14,0.16);
        bloodBurst(b.x,b.y,5);
        bossBullets.splice(i,1);
        if(player.hp<=0){
          player.hp=0;
          toast('GAME OVER',1600);
          state.paused=true;
          audio.stopBGM();
          writeSave(makeSave());
        }
        continue;
      }
      if(b.life<=0 || b.x<-80 || b.x>W+80 || b.y<-80 || b.y>H+80) bossBullets.splice(i,1);
    }

    // enemies + contact dmg
    for(const e of enemies){
      if(e.hp<=0){
        e.x += e.vx*dt*0.35;
        e.hit = Math.max(0, e.hit - dt);
        continue;
      }
      e.x += e.vx*dt;
      e.y = gy - e.h;
      e.anim += dt*(e.type==='runner'?9.0:6.8);
      e.frame = Math.floor(e.anim) % 4;
      e.hit = Math.max(0, e.hit - dt);

      // boss tracks player
      if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }

        const targetX = player.x + (player.face>0 ? 240 : -240);
        e.vx = clamp((targetX - e.x)*0.25, -140, 20);
      }

      if(player.inv<=0 && rectsOverlap(player.x, player.y, player.w, player.h, e.x, e.y, e.w, e.h)){
        player.hp -= dt * e.dmg;
        player.inv = 0.18;
        cam.shake(8, 0.12);
        if(player.hp<=0){
          player.hp = 0;
          toast('GAME OVER', 1600);
          state.paused = true;
          audio.stopBGM();
          writeSave(makeSave());
        }
      }

      if(e.x < -e.w*4){
        e.x = W + rand(120, 520);
      }
    }

    // drops
    for(let i=drops.length-1;i>=0;i--){
      const d = drops[i];
      d.t += dt;
      d.x += d.vx*dt;
      d.y += d.vy*dt;
      d.vy += 980*dt*0.75;

      if(d.kind==='coin'){
        const px = player.x + player.w*0.5;
        const py = player.y + player.h*0.65;
        if(Math.hypot(d.x-px, d.y-py) < 46){
          world.coins += 1;
          drops.splice(i,1);
          writeSave(makeSave());
          continue;
        }
      }

      if(d.t >= Math.abs(d.life)) drops.splice(i,1);
    }

    particles.update(dt);
    fps.tick(dt);
  }

  function draw(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,W,H);

    ctx.save();
    cam.apply(ctx);

    // background by map
    drawLayer(bg.far, 0.18, 0.75);
    drawLayer(bg.mid, 0.30, 0.85);
    drawLayer(bg.near, 0.42, 1.0);

    const gy = floorY();
    // ground
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, gy+110, W, H-(gy+110));
    ctx.fillStyle = "rgba(10,10,18,0.72)";
    ctx.fillRect(0, gy+80, W, 140);

    // road stripe
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 6;
    ctx.setLineDash([28, 24]);
    ctx.beginPath();
    ctx.moveTo(0, gy+150);
    ctx.lineTo(W, gy+150);
    ctx.stroke();
    ctx.setLineDash([]);

    // shadows
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(player.x + player.w*0.5, gy+140, player.w*0.35, 16, 0, 0, Math.PI*2);
    ctx.fill();

    for(const e of enemies){
      if(e.hp<=0) continue;
      ctx.beginPath();
      ctx.ellipse(e.x + e.w*0.5, gy+140, e.w*0.35, 16, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // enemies
    for(const e of enemies){
      if(e.hp<=0) continue;
      const tint = e.hit>0 ? 0.55 : 1.0;
      const flip = true;
      const rowE = (e.hit>0) ? 2 : 0;
      zombieSheet.draw(ctx, e.frame, e.x, e.y, e.w, e.h, flip, tint, rowE);
      if(e.type==='boss'){
        // boss skills: shoot spread
        e.shootT = (e.shootT||0) - dt;
        if(e.shootT<=0){
          e.shootT = 1.2 - Math.min(0.6, world.wave*0.04);
          const cx = e.x + e.w*0.25;
          const cy = e.y + e.h*0.45;
          const base = Math.atan2((player.y+player.h*0.55)-cy, (player.x+player.w*0.5)-cx);
          const spread = 0.18;
          for(let k=-2;k<=2;k++){
            const ang = base + k*spread;
            bossBullets.push({x:cx,y:cy,vx:Math.cos(ang)*420,vy:Math.sin(ang)*420,life:2.2});
          }
          cam.shake(10,0.10);
        }

        // boss name
        ctx.save();
        ctx.fillStyle="rgba(255,255,255,0.75)";
        ctx.font = `${Math.floor(14*DPR)}px system-ui`;
        ctx.textAlign="center";
        ctx.fillText("BOSS", e.x+e.w*0.5, e.y-8*DPR);
        ctx.restore();
      }
    }

    // player flash on inv
    const flash = player.inv>0 ? 0.7 : 1.0;
    const rowP = (player.atkCD>0.14 || (player.weapon==='gun' && player.gunCD>0.12)) ? 1 : (player.inv>0 ? 2 : 0);
    playerSheet.draw(ctx, player.frame, player.x, player.y, player.w, player.h, player.face<0, flash, rowP);

    // bullets
    if(upgrades.gun){
      ctx.save();
      ctx.strokeStyle="rgba(255,220,120,0.95)";
      ctx.lineWidth=4*DPR;
      for(const b of bullets){
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - (b.vx>0?18:-18), b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // drops
    for(const d of drops){
      if(d.kind==='coin'){
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "rgba(255,210,80,0.95)";
        ctx.beginPath();
        ctx.arc(d.x, d.y, 6*DPR, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }else{
        ctx.save();
        ctx.globalAlpha = 0.6;
        const s = 42*DPR;
        ctx.drawImage(fxBlood, d.x-s*0.5, d.y-s*0.5, s, s);
        ctx.restore();
      }
    }

    particles.draw(ctx);
    stick.draw(ctx);

    ctx.restore();

    // splash
    if(state.mode!=='game'){
      const lw = Math.min(W*0.6, 820*DPR);
      const lh = lw*(logo.height/logo.width);
      ctx.globalAlpha = 0.95;
      ctx.drawImage(logo, (W-lw)/2, H*0.12, lw, lh);
      ctx.globalAlpha = 1;
    }

    drawHUD();
  }

  function loop(ts){
    if(!state.runningRAF) return;
    const dt = Math.min(0.05, (ts - loop._last) / 1000);
    loop._last = ts;
    resize();
    if(state.mode==='game' && !state.paused) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  loop._last = performance.now();

  function selectMapAssets(){
    const m = state.map;
    if(m==='night'){
      return { far:'bg_night_far.png', mid:'bg_night_mid.png', near:'bg_night_near.png' };
    }
    if(m==='ruins'){
      return { far:'bg_ruins_far.png', mid:'bg_ruins_mid.png', near:'bg_ruins_near.png' };
    }
    if(m==='toxic'){
      return { far:'bg_toxic_far.png', mid:'bg_toxic_mid.png', near:'bg_toxic_near.png' };
    }
    return { far:'bg_layer_far.png', mid:'bg_layer_mid.png', near:'bg_layer_near.png' };
  }

  function hardResetRun(){
    enemies.length=0;
    bullets.length=0;
    drops.length=0;
    world.t=0; world.scroll=0; world.wave=1; world.kills=0;
    world.bossAlive=false; world.bossHp=0; world.bossHpMax=0;
    player.x=280; player.hp=player.hpMax; player.weapon='melee';
    player.atkCD=0; player.skillCD=0; player.gunCD=0; player.inv=0;
  }

  function startGame(forceNew){
    const s = loadSave();
    if(forceNew || !s){
      // keep upgrades but reset world if new game
      world.wave = 1;
      world.kills = 0;
      // coins keep (like roguelite) — if you want reset coins, set 0
      // world.coins = 0;
    }else{
      applySave(s);
    }

    // apply hp upgrade
    player.hpMax = 100 + upgrades.hp*10;
    player.hp = player.hpMax;

    state.mode='game';
    state.paused=false;

    if(menuPanel) menuPanel.style.display='none';
    showShop(false);

    // spawn initial
    enemies.length=0;
    bullets.length=0;
    drops.length=0;
    world.bossAlive=false;
    for(let i=0;i<3;i++) spawnWaveMix();

    writeSave(makeSave());
    audio.playBGM();
    toast('GO!', 900);

    if(!state.runningRAF){
      state.runningRAF=true;
      requestAnimationFrame(loop);
    }
  }

  // Boot assets
  (async function boot(){
    try{
      logo = await loadImg('logo_hd.png');
      fxBlood = await loadImg('fx_blood.png');
      playerSheetImg = await loadImg('player_adv_sheet.png');

      // Skin helpers
      function _skinFile(){
        if(state.skin==='red') return 'player_skin_red.png';
        if(state.skin==='green') return 'player_skin_green.png';
        if(state.skin==='gold') return 'player_skin_gold.png';
        return 'player_adv_sheet.png';
      }
      async function reloadSkin(){
        playerSheetImg = await loadImg(_skinFile());
        playerSheet = new SpriteSheet(playerSheetImg, 96, 160, 6, 4);
        writeSave(makeSave());
      }

      zombieSheetImg = await loadImg('zombie_adv_sheet.png');
      playerSheet = new SpriteSheet(playerSheetImg, 96, 160, 6, 4);
      zombieSheet = new SpriteSheet(zombieSheetImg, 96, 160, 6, 4);

      // load map backgrounds
      const mapFiles = selectMapAssets();
      bg.far = await loadImg(mapFiles.far);
      bg.mid = await loadImg(mapFiles.mid);
      bg.near = await loadImg(mapFiles.near);

      // load save
      const s = loadSave();
      if(s) applySave(s);
      refreshSaveInfo();
      renderShop();

      // set map buttons highlight-ish (simple)
      toast('Ready (FULL)', 900);

      // start raf even on menu so background anim visible
      if(!state.runningRAF){
        state.runningRAF=true;
        requestAnimationFrame(loop);
      }

    }catch(e){
      alert('BOOT FAIL: ' + (e.message||e));
    }
  })();

  // when map changes, reload backgrounds quickly
  function reloadMap(){
    const mf = selectMapAssets();
    Promise.all([loadImg(mf.far), loadImg(mf.mid), loadImg(mf.near)]).then(([a,b,c])=>{
      bg.far=a; bg.mid=b; bg.near=c;
      writeSave(makeSave());
    }).catch(()=>{});
  }
  const _setMap = (m)=>{ state.map=m; toast('Map: '+m, 900); reloadMap(); refreshSaveInfo(); };
  if(mapCityBtn) mapCityBtn.onclick = ()=> _setMap('city');
  if(mapNightBtn) mapNightBtn.onclick = ()=> _setMap('night');
  if(mapRuinsBtn) mapRuinsBtn.onclick = ()=> _setMap('ruins');
  if(mapToxicBtn) mapToxicBtn.onclick = ()=> _setMap('toxic');

  // Skin change
  const _setSkin = (s)=>{ state.skin=s; toast('Skin: '+s, 900); reloadSkin().catch(()=>{}); refreshSaveInfo(); };
  if(skinRedBtn) skinRedBtn.onclick = ()=> _setSkin('red');
  if(skinGreenBtn) skinGreenBtn.onclick = ()=> _setSkin('green');
  if(skinGoldBtn) skinGoldBtn.onclick = ()=> _setSkin('gold');
  if(skinDefaultBtn) skinDefaultBtn.onclick = ()=> _setSkin('default');

  if(newGameBtn) newGameBtn.onclick = ()=> startGame(true);
  if(continueBtn) continueBtn.onclick = ()=> startGame(false);
  if(openShopBtn) openShopBtn.onclick = ()=> openShop(true);
  if(closeShopBtn) closeShopBtn.onclick = ()=> closeShop();
  if(resetSaveBtn) resetSaveBtn.onclick = ()=>{ resetSave(); toast('Save reset', 900); refreshSaveInfo(); };

})();
