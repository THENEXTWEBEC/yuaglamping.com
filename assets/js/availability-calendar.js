import {addDays,isOccupied,canArrive,canDepart} from './availability-rules.mjs?v=1';
const form=document.querySelector('#quote-form');
if(form){
  const arrival=form.elements.checkin,departure=form.elements.checkout,cabin=form.elements.cabin;
  const api='https://yua-glamping-admin-439z.onrender.com/api/public';
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const monthOf=day=>day.slice(0,7)+'-01';
  const monthLabel=month=>new Intl.DateTimeFormat('es-EC',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'T12:00:00Z'));
  const dayLabel=day=>new Intl.DateTimeFormat('es-EC',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
  const arrow=direction=>'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="'+(direction==='prev'?'m14 6-6 6 6 6':'m10 6 6 6-6 6')+'"/></svg>';
  const dialog=document.createElement('dialog');dialog.className='yua-calendar';dialog.id='yua-date-calendar';
  dialog.setAttribute('aria-labelledby','yua-date-title');document.body.append(dialog);
  const notice=document.createElement('p');notice.className='yua-date-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');departure.closest('label').after(notice);
  let cabins,mode='arrival',view=monthOf(arrival.value||today()),ranges=[],loaded=false,loading=false,error='',sequence=0,controller,returnFocus;
  function notify(message){notice.textContent=message}
  function change(field,value){field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}))}
  function close(){dialog.close();returnFocus?.focus()}
  function shiftMonth(value,amount){const date=new Date(value+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+amount);return date.toISOString().slice(0,10)}
  function gridStart(){const date=new Date(view+'T12:00:00Z');return addDays(view,-((date.getUTCDay()+6)%7))}
  function selectable(day){return loaded&&!loading&&!error&&(mode==='arrival'?canArrive(day,ranges,today()):canDepart(day,arrival.value,ranges))}
  function render(){
    const focused=dialog.querySelector(':focus')?.dataset.day;
    dialog.innerHTML='<header><div><p class="yc-eyebrow"></p><h2 id="yua-date-title"></h2></div><button type="button" class="yc-close" aria-label="Cerrar calendario">×</button></header><p class="yc-instruction"></p><div class="yc-month"><button type="button" data-move="-1" aria-label="Mes anterior">'+arrow('prev')+'</button><strong></strong><button type="button" data-move="1" aria-label="Mes siguiente">'+arrow('next')+'</button></div><div class="yc-week" aria-hidden="true"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="yc-days" role="group" aria-label="Fechas de la estadía"></div><p class="yc-state" role="status"></p><div class="yc-legend"><span><i></i>Disponible</span><span><i class="yc-busy"></i>Ocupado</span></div>';
    dialog.querySelector('.yc-eyebrow').textContent='Disponibilidad · '+cabin.value;
    dialog.querySelector('h2').textContent=mode==='arrival'?'Elige tu ingreso':'Elige tu salida';
    dialog.querySelector('.yc-instruction').textContent=mode==='arrival'?'Los días ocupados no se pueden seleccionar.':'Ingreso: '+dayLabel(arrival.value)+'. Puedes salir el día en que comienza otra reserva.';
    dialog.querySelector('.yc-month strong').textContent=monthLabel(view);
    const prev=dialog.querySelector('[data-move="-1"]'),next=dialog.querySelector('[data-move="1"]');
    prev.disabled=view<=monthOf(mode==='departure'?arrival.value:today());
    next.disabled=mode==='departure'&&shiftMonth(view,1)>monthOf(addDays(arrival.value,45));
    const grid=dialog.querySelector('.yc-days'),first=gridStart();
    for(let offset=0;offset<42;offset++){
      const day=addDays(first,offset),button=document.createElement('button');
      button.type='button';button.dataset.day=day;button.textContent=String(Number(day.slice(8)));
      const busy=isOccupied(day,ranges),allowed=selectable(day);
      button.disabled=!allowed;button.classList.toggle('yc-outside',day.slice(0,7)!==view.slice(0,7));
      button.classList.toggle('yc-occupied',loaded&&busy&&!allowed);
      button.classList.toggle('yc-selected',day===arrival.value||day===departure.value);
      button.classList.toggle('yc-between',Boolean(arrival.value&&departure.value&&day>arrival.value&&day<departure.value));
      const label=!loaded?'Consultando':busy&&!allowed?'Ocupado':allowed?'Disponible':'No disponible para esta estadía';
      button.setAttribute('aria-label',dayLabel(day)+', '+label);
      if(day===today())button.setAttribute('aria-current','date');
      if(day===arrival.value||day===departure.value)button.setAttribute('aria-pressed','true');
      button.onclick=()=>{
        if(!selectable(day))return;
        if(mode==='arrival'){
          change(arrival,day);change(departure,'');mode='departure';view=monthOf(day);notify('');refresh();
        }else{change(departure,day);notify('');close();refresh()}
      };
      grid.append(button);
    }
    const state=dialog.querySelector('.yc-state');state.textContent=loading?'Consultando calendario…':error||'Calendario sincronizado con YUA.';
    if(error){const retry=document.createElement('button');retry.type='button';retry.className='yc-retry';retry.textContent='Reintentar';retry.onclick=()=>refresh();state.append(document.createElement('br'),retry)}
    dialog.querySelector('.yc-close').onclick=close;
    [prev,next].forEach(button=>button.onclick=()=>{view=shiftMonth(view,Number(button.dataset.move));refresh()});
    if(focused)dialog.querySelector('[data-day="'+focused+'"]:not(:disabled)')?.focus();
  }
  async function read(path,options={}){
    const response=await fetch(api+path,{...options,signal:controller.signal,cache:'no-store',credentials:'omit'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'No pudimos consultar el calendario.');return data;
  }
  async function refresh(){
    const current=++sequence;controller?.abort();controller=new AbortController();
    const timeout=setTimeout(()=>{if(current===sequence)controller.abort()},15000);
    loaded=false;loading=true;error='';if(dialog.open)render();
    try{
      if(!cabins)cabins=(await read('/config')).cabins;
      if(current!==sequence)return;
      const selected=cabins.find(item=>item.name.toUpperCase()===cabin.value.toUpperCase());
      if(!selected)throw new Error('Esta cabaña no está disponible.');
      let from=dialog.open?gridStart():arrival.value||today();
      let to=dialog.open?addDays(gridStart(),42):departure.value||addDays(from,45);
      if(dialog.open&&mode==='departure'&&arrival.value<from)from=arrival.value;
      const params=new URLSearchParams({cabinId:selected.id,from,to});
      const data=await read('/calendar?'+params);
      if(current!==sequence)return;
      if(!Array.isArray(data.unavailable))throw new Error('No pudimos cargar las fechas ocupadas.');
      ranges=data.unavailable;loaded=true;
      if(arrival.value&&departure.value){
        let available;
        if(arrival.value>=from&&departure.value<=to)available=canDepart(departure.value,arrival.value,ranges);
        else available=(await read('/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cabinId:selected.id,arrival:arrival.value,departure:departure.value})})).available;
        if(current!==sequence)return;
        if(!available){change(arrival,'');change(departure,'');mode='arrival';notify('Las fechas elegidas están ocupadas en '+cabin.value+'. Selecciona otras fechas.')}
      }else if(arrival.value&&arrival.value>=from&&arrival.value<to&&isOccupied(arrival.value,ranges)){
        change(arrival,'');change(departure,'');mode='arrival';notify('Ese ingreso ya está ocupado. Selecciona otra fecha.');
      }
    }catch(e){
      if(current!==sequence)return;
      error='No pudimos actualizar la disponibilidad. Intenta nuevamente.';if(!dialog.open)notify(error);
    }finally{
      clearTimeout(timeout);if(current===sequence){loading=false;if(dialog.open)render()}
    }
  }
  function open(field){
    returnFocus=field;mode=field===departure&&arrival.value?'departure':'arrival';
    view=monthOf((mode==='departure'?departure.value||arrival.value:arrival.value)||today());
    if(view<monthOf(today()))view=monthOf(today());
    render();if(!dialog.open)dialog.showModal();refresh();
  }
  for(const field of [arrival,departure]){
    field.type='text';field.readOnly=true;field.placeholder='Elige una fecha';
    field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls',dialog.id);field.autocomplete='off';
    field.addEventListener('click',()=>open(field));
    field.addEventListener('keydown',event=>{if(['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();open(field)}});
  }
  dialog.addEventListener('click',event=>{if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close()}});
  dialog.addEventListener('keydown',event=>{
    const focused=document.activeElement;if(!focused?.dataset.day)return;
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
    if(offsets[event.key]){event.preventDefault();const target=addDays(focused.dataset.day,offsets[event.key]);dialog.querySelector('[data-day="'+target+'"]:not(:disabled)')?.focus()}
  });
  cabin.addEventListener('change',()=>{notify('');if(arrival.value||departure.value||dialog.open)refresh()});
  window.addEventListener('focus',()=>{if(dialog.open||arrival.value&&departure.value)refresh()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(dialog.open||arrival.value&&departure.value))refresh()});
  setInterval(()=>{if(!document.hidden&&(dialog.open||arrival.value&&departure.value))refresh()},30000);
  if(arrival.value||departure.value)refresh();
}
