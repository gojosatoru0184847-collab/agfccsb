\
    (function(){
      'use strict';

      const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
      const lerp=(a,b,t)=>a+(b-a)*t;
      const rand=(a,b)=>a+Math.random()*(b-a);

      // --- Toast ---
      function toast(msg, ms=1200){
        const t=document.getElementById('toast');
        const m=document.getElementById('toastMsg');
        if(!t||!m) return;
        m.textContent=msg;
        t.style.display='block';
        clearTimeout(toast._tm);
        toast._tm=setTimeout(()=>{t.style.display='none';}, ms);
      }

      // --- AudioEngine ---
      class AudioEngine{
        constructor(){
          this.enabled=true;
          this.unlocked=false;
          this.bgm=null;
          this.sfx=new Map();
          this._installUnlock();
        }
        _installUnlock(){
          const unlock=()=>{
            if(this.unlocked) return;
            this.unlocked=true;
            if(this.bgm){
              this.bgm.play().then(()=>{
                this.bgm.pause();
                this.bgm.currentTime=0;
              }).catch(()=>{});
            }
            window.removeEventListener('touchstart', unlock);
            window.removeEventListener('click', unlock);
          };
          window.addEventListener('touchstart', unlock, {passive:true});
          window.addEventListener('click', unlock, {passive:true});
        }
        loadBGM(src){
          this.bgm=new Audio(src);
          this.bgm.loop=true;
          this.bgm.volume=0.65;
          return this.bgm;
        }
        loadSFX(name, src){
          const a=new Audio(src);
          a.volume=0.85;
          this.sfx.set(name, a);
          return a;
        }
        playBGM(){
          if(!this.bgm||!this.enabled) return;
          this.bgm.play().catch(()=>{});
        }
        stopBGM(){
          if(!this.bgm) return;
          this.bgm.pause();
        }
        playSFX(name){
          const a=this.sfx.get(name);
          if(!a||!this.enabled) return;
          try{
            a.currentTime=0;
            a.play().catch(()=>{});
          }catch(e){}
        }
      }

      // --- Touch Joystick (left side) ---
      class TouchStick{
        constructor(){
          this.active=false;
          this.id=null;
          this.cx=0; this.cy=0;
          this.x=0; this.y=0;
          this.dx=0; this.dy=0;
          this.power=0;
          this.radius=70;
          this.dead=0.12;
          this.icon=new Image();
          this.icon.src="ui_joystick.png";
        }
        attach(el){
          el.addEventListener('touchstart', (e)=>{
            for(const t of e.changedTouches){
              if(t.clientX < innerWidth*0.45){
                this.active=true;
                this.id=t.identifier;
                this.cx=t.clientX; this.cy=t.clientY;
                this.x=t.clientX; this.y=t.clientY;
                this._recalc();
                break;
              }
            }
          }, {passive:false});

          el.addEventListener('touchmove', (e)=>{
            if(!this.active) return;
            for(const t of e.changedTouches){
              if(t.identifier===this.id){
                this.x=t.clientX; this.y=t.clientY;
                this._recalc();
                break;
              }
            }
            e.preventDefault();
          }, {passive:false});

          const end=(e)=>{
            if(!this.active) return;
            for(const t of e.changedTouches){
              if(t.identifier===this.id){
                this.active=false;
                this.id=null;
                this.dx=this.dy=0;
                this.power=0;
                break;
              }
            }
          };
          el.addEventListener('touchend', end, {passive:true});
          el.addEventListener('touchcancel', end, {passive:true});
        }
        _recalc(){
          const vx=this.x-this.cx, vy=this.y-this.cy;
          const dist=Math.hypot(vx,vy);
          const p=clamp(dist/this.radius, 0, 1);
          const ax=dist>0?vx/dist:0;
          const ay=dist>0?vy/dist:0;
          this.power = (p < this.dead) ? 0 : p;
          this.dx = ax * this.power;
          this.dy = ay * this.power;
        }
        draw(ctx){
          if(!this.active) return;
          const r=this.radius;
          ctx.save();
          ctx.globalAlpha=0.75;
          ctx.drawImage(this.icon, this.cx-r, this.cy-r, r*2, r*2);
          const k=32;
          ctx.globalAlpha=0.85;
          ctx.fillStyle="rgba(255,255,255,.25)";
          ctx.beginPath();
          ctx.arc(this.cx + this.dx*r*0.55, this.cy + this.dy*r*0.55, k, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();
        }
      }

      // --- SpriteSheet ---
      class SpriteSheet{
        constructor(img, frameW, frameH, framesX, framesY=1){
          this.img=img;
          this.fw=frameW; this.fh=frameH;
          this.framesX=framesX;
          this.framesY=framesY;
        }
        draw(ctx, frame, x, y, w, h, flip=false, alpha=1, row=0){
          const fx = ((frame%this.framesX)+this.framesX)%this.framesX;
          const ry = ((row%this.framesY)+this.framesY)%this.framesY;
          const sx = fx*this.fw, sy=ry*this.fh;
          ctx.save();
          ctx.globalAlpha=alpha;
          if(flip){
            ctx.translate(x+w, y);
            ctx.scale(-1,1);
            ctx.drawImage(this.img, sx, sy, this.fw, this.fh, 0, 0, w, h);
          }else{
            ctx.drawImage(this.img, sx, sy, this.fw, this.fh, x, y, w, h);
          }
          ctx.restore();
        }
      }

      // --- Particles ---
      class ParticleSystem{
        constructor(){ this.p=[]; }
        burst(x,y, n=18){
          for(let i=0;i<n;i++){
            this.p.push({
              x, y,
              vx: rand(-260,260),
              vy: rand(-420,-80),
              life: rand(0.25,0.55),
              t: 0,
              size: rand(3,7),
              a: rand(0.6,1.0)
            });
          }
        }
        update(dt){
          for(let i=this.p.length-1;i>=0;i--){
            const q=this.p[i];
            q.t += dt;
            q.x += q.vx*dt;
            q.y += q.vy*dt;
            q.vy += 980*dt*0.65;
            q.a = Math.max(0, q.a - dt*2.0);
            if(q.t>=q.life || q.a<=0) this.p.splice(i,1);
          }
        }
        draw(ctx){
          ctx.save();
          for(const q of this.p){
            ctx.globalAlpha=q.a;
            ctx.fillStyle="rgba(255,220,120,1)";
            ctx.beginPath();
            ctx.arc(q.x, q.y, q.size, 0, Math.PI*2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      // --- Simple Profiler ---
      class FPSCounter{
        constructor(){
          this.fps=0;
          this._acc=0;
          this._n=0;
        }
        tick(dt){
          this._acc += dt;
          this._n++;
          if(this._acc >= 0.5){
            this.fps = Math.round(this._n / this._acc);
            this._acc=0; this._n=0;
          }
        }
      }

      // --- Camera (shake) ---
class Camera2D{
  constructor(){ this.x=0; this.y=0; this.shakeT=0; this.shakeP=0; }
  shake(power=10, time=0.18){
    this.shakeP = Math.max(this.shakeP, power);
    this.shakeT = Math.max(this.shakeT, time);
  }
  update(dt){
    if(this.shakeT>0){
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT / 0.18;
      this.x = (Math.random()*2-1) * this.shakeP * k;
      this.y = (Math.random()*2-1) * this.shakeP * k;
    }else{
      this.x=this.y=0;
      this.shakeP=0;
    }
  }
  apply(ctx){ ctx.translate(this.x, this.y); }
}

window.ADR = {
        clamp, lerp, rand,
        toast,
        AudioEngine,
        TouchStick,
        SpriteSheet,
        ParticleSystem,
        FPSCounter,
        Camera2D
      };
    })();
