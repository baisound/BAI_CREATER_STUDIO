(function(root){'use strict';
const modes=['linear','hold','smooth','bezier','sine','quad','cubic','quart','quint','expo','circ','back','bounce','elastic','custom'];
function handles(h){if(!Array.isArray(h)||h.length!==4||!h.every(Number.isFinite)||h[0]<0||h[2]>1||h[0]>h[2]||h[1]<-2||h[1]>3||h[3]<-2||h[3]>3)throw Error('制御点は0≤X1≤X2≤1、Yは-2～3');return h}
function bezier(t,h){const [x1,y1,x2,y2]=handles(h),c=(u,a,b)=>3*(1-u)**2*u*a+3*(1-u)*u*u*b+u*u*u;let l=0,r=1;for(let i=0;i<36;i++){const m=(l+r)/2;if(c(m,x1,x2)<t)l=m;else r=m}return c((l+r)/2,y1,y2)}
function ease(mode,t,h){t=Math.max(0,Math.min(1,t));if(t===0||t===1)return t;switch(mode){
case 'linear':return t;case 'hold':return 0;case 'smooth':return t*t*(3-2*t);case 'bezier':return bezier(t,[.25,.1,.25,1]);case 'custom':return bezier(t,h);
case 'sine':return -(Math.cos(Math.PI*t)-1)/2;
case 'quad':return t<.5?2*t*t:1-(-2*t+2)**2/2;
case 'cubic':return t<.5?4*t**3:1-(-2*t+2)**3/2;
case 'quart':return t<.5?8*t**4:1-(-2*t+2)**4/2;
case 'quint':return t<.5?16*t**5:1-(-2*t+2)**5/2;
case 'expo':return t<.5?2**(20*t-10)/2:(2-2**(-20*t+10))/2;
case 'circ':return t<.5?(1-Math.sqrt(1-(2*t)**2))/2:(Math.sqrt(1-(-2*t+2)**2)+1)/2;
case 'back':{const c2=1.70158*1.525;return t<.5?(2*t)**2*((c2+1)*2*t-c2)/2:((2*t-2)**2*((c2+1)*(2*t-2)+c2)+2)/2}
case 'bounce':{const out=x=>{let n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d){x-=1.5/d;return n*x*x+.75}if(x<2.5/d){x-=2.25/d;return n*x*x+.9375}x-=2.625/d;return n*x*x+.984375};return t<.5?(1-out(1-2*t))/2:(1+out(2*t-1))/2}
case 'elastic':{const c=2*Math.PI/4.5;return t<.5?-(2**(20*t-10)*Math.sin((20*t-11.125)*c))/2:2**(-20*t+10)*Math.sin((20*t-11.125)*c)/2+1}
default:throw Error('不明な補間方式: '+mode)
}}
root.BAICameraEasing={modes,handles,bezier,ease};if(typeof module!=='undefined')module.exports=root.BAICameraEasing;
})(typeof window!=='undefined'?window:globalThis);
