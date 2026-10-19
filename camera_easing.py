"""Camera key-to-key easing. Bézier X handles must be monotonic."""
import math
MODES=('linear','hold','smooth','bezier','sine','quad','cubic','quart','quint','expo','circ','back','bounce','elastic','custom')
def handles(value):
    if not isinstance(value,list) or len(value)!=4 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in value):raise ValueError('invalid Bezier handles')
    x1,y1,x2,y2=map(float,value)
    if not (0<=x1<=x2<=1 and -2<=y1<=3 and -2<=y2<=3):raise ValueError('Bezier handles outside allowed range')
    return [x1,y1,x2,y2]
def bezier(t,h):
    x1,y1,x2,y2=handles(h)
    def curve(u,a,b):return 3*(1-u)**2*u*a+3*(1-u)*u*u*b+u*u*u
    lo,hi=0.,1.
    for _ in range(36):
        u=(lo+hi)/2
        if curve(u,x1,x2)<t:lo=u
        else:hi=u
    return curve((lo+hi)/2,y1,y2)
def ease(mode,t,custom=None):
    t=max(0.,min(1.,float(t)))
    if t==0 or t==1:return t
    if mode=='linear':return t
    if mode=='hold':return 0.
    if mode=='smooth':return t*t*(3-2*t)
    if mode=='bezier':return bezier(t,[.25,.1,.25,1])
    if mode=='custom':return bezier(t,custom)
    if mode=='sine':return -(math.cos(math.pi*t)-1)/2
    if mode=='quad':return 2*t*t if t<.5 else 1-(-2*t+2)**2/2
    if mode=='cubic':return 4*t**3 if t<.5 else 1-(-2*t+2)**3/2
    if mode=='quart':return 8*t**4 if t<.5 else 1-(-2*t+2)**4/2
    if mode=='quint':return 16*t**5 if t<.5 else 1-(-2*t+2)**5/2
    if mode=='expo':return 2**(20*t-10)/2 if t<.5 else (2-2**(-20*t+10))/2
    if mode=='circ':return (1-math.sqrt(1-(2*t)**2))/2 if t<.5 else (math.sqrt(1-(-2*t+2)**2)+1)/2
    if mode=='back':
        c1=1.70158;c2=c1*1.525
        return ((2*t)**2*((c2+1)*2*t-c2))/2 if t<.5 else ((2*t-2)**2*((c2+1)*(2*t-2)+c2)+2)/2
    if mode=='bounce':
        def out(x):
            n=7.5625;d=2.75
            if x<1/d:return n*x*x
            if x<2/d:x-=1.5/d;return n*x*x+.75
            if x<2.5/d:x-=2.25/d;return n*x*x+.9375
            x-=2.625/d;return n*x*x+.984375
        return (1-out(1-2*t))/2 if t<.5 else (1+out(2*t-1))/2
    if mode=='elastic':
        c=2*math.pi/4.5
        return -(2**(20*t-10)*math.sin((20*t-11.125)*c))/2 if t<.5 else 2**(-20*t+10)*math.sin((20*t-11.125)*c)/2+1
    raise ValueError('invalid camera interpolation')
