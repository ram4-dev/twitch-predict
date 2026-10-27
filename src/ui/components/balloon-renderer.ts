// The supplied artwork is a texture, never replaced with a substitute font.
// Five subdivided membranes give each letter its own soft inflation and spring.
const VERTEX=`
attribute vec2 a_grid;
uniform vec2 u_view;
uniform vec4 u_glyph;
uniform vec4 u_frame;
uniform vec4 u_motion;
uniform vec2 u_pointer;
uniform float u_activity;
varying vec2 v_uv;
varying vec2 v_local;
void main(){
 vec2 local=a_grid-.5;
 float belly=sin(a_grid.x*3.14159)*sin(a_grid.y*3.14159);
 float inflate=u_motion.x;
 vec2 shape=local*u_glyph.zw;
 shape*=vec2(inflate+u_motion.y,inflate-u_motion.y*.65);
 shape.x+=belly*u_glyph.z*.035*u_activity*sin(a_grid.y*6.28318+u_motion.z);
 shape.y+=belly*u_glyph.w*.025*u_activity*sin(a_grid.x*3.14159+u_motion.z);
 float angle=u_motion.w;
 shape=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*shape;
 shape+=u_pointer*belly*12.;
 vec2 source=u_glyph.xy+u_glyph.zw*.5+shape;
 float fit=min(u_view.x/u_frame.z,u_view.y/u_frame.w);
 vec2 pixel=(source-u_frame.xy-u_frame.zw*.5)*fit+u_view*.5;
 gl_Position=vec4(pixel.x/u_view.x*2.-1.,1.-pixel.y/u_view.y*2.,0.,1.);
 v_uv=vec2((u_glyph.x+a_grid.x*u_glyph.z)/1792.,1.-(u_glyph.y+a_grid.y*u_glyph.w)/1008.);
 v_local=a_grid;
}`;
const FRAGMENT=`
precision mediump float;
uniform sampler2D u_image;
uniform float u_light;
varying vec2 v_uv;
varying vec2 v_local;
void main(){
 vec3 color=texture2D(u_image,v_uv).rgb;
 float ink=max(color.r,max(color.g,color.b));
 float alpha=smoothstep(.055,.17,ink);
 float gloss=pow(max(0.,1.-abs(v_local.x-(.2+.6*u_light))*.9),22.)*.07;
 color+=vec3(gloss)*sin(v_local.y*3.14159);
 gl_FragColor=vec4(color,alpha);
}`;
const GLYPHS=[[400,310,280,390],[680,310,100,390],[782,388,258,310],[1038,320,174,380],[1218,260,182,440]];
export function animateBalloonWordmark(root:HTMLElement,canvas:HTMLCanvasElement,paused:boolean,onReady:(ready:boolean)=>void){
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 if(media.matches||paused)return()=>{};
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
 if(!gl)return()=>{};
 let disposed=false,visible=true,raf=0,last=0,width=1,height=1,pressed=false,hover=false;
 let activity=0,phase=0,squeeze=0,velocity=0,px=0,py=0,targetX=0,targetY=0;
 const shaders:WebGLShader[]=[],program=gl.createProgram(),buffer=gl.createBuffer(),texture=gl.createTexture();
 if(!program||!buffer||!texture)return()=>{};
 const stop=()=>{cancelAnimationFrame(raf);raf=0;};
 const shader=(type:number,source:string)=>{const s=gl.createShader(type);if(!s)throw new Error('Shader unavailable');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Shader compile failed');return s;};
 const locations:Record<string,WebGLUniformLocation|null>={};
 const draw=(now:number)=>{
  raf=0;if(disposed||!loaded||gl.isContextLost()||!visible||document.hidden||media.matches)return;
  raf=requestAnimationFrame(draw);if(now-last<32)return;
  const dt=Math.min(2,(now-last)/33||1);last=now;
  activity+=((hover||pressed?1:0)-activity)*Math.min(1,.18*dt);phase+=.045*dt;
  const target=pressed?-.07:hover?-.025:0;
  velocity=(velocity+(target-squeeze)*.15*dt)*Math.pow(.72,dt);squeeze+=velocity*dt;
  px+=(targetX-px)*.18;py+=(targetY-py)*.18;
  const moving=hover||pressed||activity>.001||Math.abs(squeeze)+Math.abs(velocity)+Math.abs(px-targetX)+Math.abs(py-targetY)>.001;
  if(!moving){activity=squeeze=velocity=px=py=0;}
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.uniform2f(locations.u_view,width,height);gl.uniform4f(locations.u_frame,380,250,1040,465);
  gl.uniform1f(locations.u_activity,activity);gl.uniform2f(locations.u_pointer,px,py);gl.uniform1f(locations.u_light,.5+px*.35);
  GLYPHS.forEach((glyph,i)=>{
   const localPhase=phase+i*.85,breath=Math.sin(localPhase)*.012*activity;
   gl.uniform4f(locations.u_glyph,...glyph as [number,number,number,number]);
   gl.uniform4f(locations.u_motion,1+activity*.025+breath,squeeze,localPhase,Math.sin(localPhase*.8)*.018*activity+px*.025);
   gl.drawArrays(gl.TRIANGLES,0,8*12*6);
  });
  canvas.dataset.motion=hover||pressed?'reacting':moving?'settling':'resting';
  if(!moving)stop();
 };
 const wake=()=>{if(!raf&&!disposed&&loaded&&!gl.isContextLost()&&visible&&!document.hidden&&!media.matches){last=performance.now();raf=requestAnimationFrame(draw);}};
 const layout=()=>{const box=root.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);wake();};
 const move=(event:PointerEvent)=>{const box=root.getBoundingClientRect();targetX=Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1));targetY=Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1));hover=true;wake();};
 const leave=()=>{hover=false;pressed=false;targetX=targetY=0;wake();};
 const down=()=>{pressed=true;velocity-=.035;wake();};const up=()=>{pressed=false;wake();};
 const visibility=()=>{if(document.hidden)stop();else wake();};
 const reduced=()=>{if(media.matches){stop();onReady(false);}else if(loaded&&!gl.isContextLost()){onReady(true);wake();}};
 const lost=(event:Event)=>{event.preventDefault();stop();onReady(false);};
 const ro=new ResizeObserver(layout),io=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??true;if(visible)wake();else stop();});
 const image=new Image();let loaded=false;
 try{
  gl.attachShader(program,shader(gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Shader link failed');
  gl.useProgram(program);const points:number[]=[];
  for(let y=0;y<12;y++)for(let x=0;x<8;x++)for(const [dx,dy]of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])points.push((x+dx)/8,(y+dy)/12);
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
  const grid=gl.getAttribLocation(program,'a_grid');gl.enableVertexAttribArray(grid);gl.vertexAttribPointer(grid,2,gl.FLOAT,false,0,0);
  for(const name of ['u_view','u_glyph','u_frame','u_motion','u_pointer','u_activity','u_image','u_light'])locations[name]=gl.getUniformLocation(program,name);
  gl.uniform1i(locations.u_image,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  image.onload=()=>{
   if(disposed)return;
   gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   loaded=true;layout();ro.observe(root);io.observe(root);onReady(true);
  };
  image.onerror=()=>onReady(false);image.src='/brand/plot-wordmark.jpg';
 }catch{onReady(false);}
 root.addEventListener('pointerenter',move);root.addEventListener('pointermove',move);root.addEventListener('pointerleave',leave);root.addEventListener('pointerdown',down);root.addEventListener('pointerup',up);root.addEventListener('pointercancel',leave);
 document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduced);canvas.addEventListener('webglcontextlost',lost);
 return()=>{
  disposed=true;stop();ro.disconnect();io.disconnect();image.onload=image.onerror=null;
  root.removeEventListener('pointerenter',move);root.removeEventListener('pointermove',move);root.removeEventListener('pointerleave',leave);root.removeEventListener('pointerdown',down);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',leave);
  document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduced);canvas.removeEventListener('webglcontextlost',lost);
  gl.deleteBuffer(buffer);gl.deleteTexture(texture);gl.deleteProgram(program);for(const s of shaders)gl.deleteShader(s);
 };
}
