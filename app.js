(() => {
  const STORAGE_KEY = 'voice-task-reminder.tasks.v1';
  const input = document.getElementById('task-input');
  const addButton = document.getElementById('add-button');
  const voiceButton = document.getElementById('voice-button');
  const voiceLabel = voiceButton.querySelector('.voice-label');
  const voiceStatus = document.getElementById('voice-status');
  const groupsRoot = document.getElementById('task-groups');
  let tasks = loadTasks();

  function loadTasks() {
    try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; }
    catch { return []; }
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  const pad = n => String(n).padStart(2, '0');
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  const chineseDigits = {零:0,〇:0,一:1,兩:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  function chineseNumber(text) {
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if (text === '半') return .5;
    if (text === '十') return 10;
    if (text.includes('十')) { const [a,b] = text.split('十'); return (a ? chineseDigits[a] : 1) * 10 + (b ? chineseDigits[b] : 0); }
    return [...text].reduce((n,ch) => chineseDigits[ch] ?? NaN, 0);
  }
  function normalize(raw) {
    let s = raw.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0));
    s = s.replace(/一個半小時/g, '1.5小時').replace(/半小時/g,'30分鐘');
    s = s.replace(/([零〇一兩二三四五六七八九十]+)(個小時|鐘頭|小時|分鐘|分)/g, (_, n, unit) => `${chineseNumber(n)}${unit === '分鐘' || unit === '分' ? '分鐘' : '小時'}`);
    s = s.replace(/小時/g, '@HOUR@').replace(/點鐘|点钟|点|時/g, '點').replace(/分(?!鐘)/g,'分鐘').replace(/個小時|鐘頭/g,'小時').replace(/@HOUR@/g,'小時');
    return s.replace(/[\s，。！？、；：,.!?;:「」『』（）()【】]/g,'');
  }
  function localDate(y,m,d,h=0,min=0) { return new Date(y,m-1,d,h,min,0,0); }
  function parseTime(raw) {
    const s = normalize(raw); const now = new Date(); let date = new Date(now); let matched = false;
    const relative = s.match(/(\d+(?:\.\d+)?)分鐘後/);
    if (relative) { date = new Date(now.getTime() + Number(relative[1])*60000); matched = true; }
    const hoursAfter = s.match(/(\d+(?:\.\d+)?)小時後/);
    if (!matched && hoursAfter) { date = new Date(now.getTime() + Number(hoursAfter[1])*3600000); matched = true; }
    if (!matched && /等一下|待會/.test(s)) { date = new Date(now.getTime()+10*60000); matched=true; }
    if (!matched && /晚一點/.test(s)) { date = new Date(now.getTime()+3600000); matched=true; }
    if (!matched && /睡前/.test(s)) return null;

    const periods = /下午|傍晚|晚上|晚間/.test(s) ? 'pm' : /早上|早晨|明早|上午|清晨/.test(s) ? 'am' : '';
    const dayOffset = /下週|下周/.test(s) ? 7 : /明天|明早|明晚/.test(s) ? 1 : /今天/.test(s) ? 0 : null;
    if (!matched) {
      let targetDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (dayOffset !== null) targetDay.setDate(targetDay.getDate()+dayOffset);
      const weekday = s.match(/(?:下週|下周|這禮拜|這週|本週)(一|二|三|四|五|六|日|天)/);
      if (weekday) {
        const map={一:1,二:2,三:3,四:4,五:5,六:6,日:0,天:0}; const wanted=map[weekday[1]];
        let delta=(wanted-targetDay.getDay()+7)%7; if (/下週|下周/.test(s)) delta = delta===0?7:delta;
        targetDay.setDate(targetDay.getDate()+delta);
      }
      const clock = s.match(/(\d{1,2})點(?:(半)|(\d{1,2})分鐘?)?/);
      const defaultDayPart = /明早|明晚/.test(s);
      if (clock) {
        let h=Number(clock[1]), m=clock[2]?30:Number(clock[3]||0);
        if (periods==='pm' && h<12) h+=12;
        if (periods==='am' && h===12) h=0;
        date=localDate(targetDay.getFullYear(),targetDay.getMonth()+1,targetDay.getDate(),h,m); matched=true;
      } else if (defaultDayPart) {
        date=localDate(targetDay.getFullYear(),targetDay.getMonth()+1,targetDay.getDate(),/明晚/.test(s)?19:8,0); matched=true;
      }
    }
    return matched ? date : null;
  }
  function cleanTitle(raw) {
    let s = normalize(raw);
    s = s.replace(/提醒我/g,'').replace(/(?:下週|下周|這禮拜|這週|本週)[一二三四五六日天]/g,'');
    s = s.replace(/今天|明天|明早|明晚|早上|早晨|上午|清晨|下午|傍晚|晚上|晚間/g,'');
    s = s.replace(/(?:\d+(?:\.\d+)?)(?:分鐘|小時)後/g,'').replace(/等一下|待會|晚一點|睡前/g,'');
    s = s.replace(/\d{1,2}點(?:半|\d{1,2}分鐘?)?/g,'').replace(/\d{1,2}點/g,'');
    return s.replace(/^[，,、:：]+|[，,、:：]+$/g,'').trim() || raw.trim();
  }
  function formatReminder(date) {
    if (!date) return '未設定提醒時間';
    const now = new Date(); const sameDay = date.toDateString()===now.toDateString();
    const tomorrow = new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toDateString()===date.toDateString();
    const prefix=sameDay?'今天':tomorrow?'明天':`${date.getMonth()+1}月${date.getDate()}日`;
    const hour=date.getHours(); const part=hour<12?'上午':'下午'; const h=hour%12||12;
    return `${prefix} ${part}${h}:${pad(date.getMinutes())}`;
  }
  function dateForClassification(task) { return task.reminderAt ? new Date(task.reminderAt) : null; }
  function getGroup(task) {
    if (task.completed) return 'done';
    const date=dateForClassification(task); if (!date) return 'todo';
    const now=new Date();
    if (date<now) return 'overdue';
    if (date.toDateString()===now.toDateString()) return 'today';
    return 'todo';
  }
  const groupMeta=[['overdue','已到期'],['today','今日任務'],['todo','待辦任務'],['done','已完成']];
  function calendarLinks(task) {
    if (!task.reminderAt) return '';
    const start=new Date(task.reminderAt), end=new Date(start.getTime()+30*60000);
    const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const description=`原始輸入：${task.original}`;
    const google=new URL('https://calendar.google.com/calendar/render');
    google.searchParams.set('action','TEMPLATE'); google.searchParams.set('text',task.title); google.searchParams.set('dates',`${utc(start)}/${utc(end)}`); google.searchParams.set('details',description);
    return `<div class="task-actions"><a class="action-button" href="${escapeHtml(google.toString())}" target="_blank" rel="noopener">加入 Google Calendar</a><button class="action-button" data-ics="${escapeHtml(task.id)}">加入 Apple 行事曆</button><button class="action-button delete" data-delete="${escapeHtml(task.id)}">刪除</button></div>`;
  }
  function render() {
    const byGroup=Object.fromEntries(groupMeta.map(([key])=>[key,[]]));
    tasks.forEach(task=>byGroup[getGroup(task)].push(task));
    groupsRoot.innerHTML=groupMeta.map(([key,label])=>{
      const list=byGroup[key];
      return `<section class="group" data-group="${key}"><h2 class="group-heading"><span class="dot"></span>${label}<span class="count">${list.length}</span></h2><div class="task-list">${list.length ? list.map(task=>`<article class="task-card ${task.completed?'completed':''}"><div class="task-top"><button class="check-button" data-toggle="${escapeHtml(task.id)}" aria-label="標記${task.completed?'未完成':'完成'}">${task.completed?'✓':''}</button><div class="task-main"><div class="task-title">${escapeHtml(task.title)}</div><div class="task-time ${task.reminderAt?'':'unscheduled'}">${escapeHtml(task.reminderAt?formatReminder(new Date(task.reminderAt)):'未設定提醒時間')}</div><div class="task-original">原始輸入：${escapeHtml(task.original)}</div></div></div>${calendarLinks(task) || `<div class="task-actions"><button class="action-button delete" data-delete="${escapeHtml(task.id)}">刪除</button></div>`}</article>`).join('') : '<div class="empty-state">目前沒有任務</div>'}</div></section>`;
    }).join('');
  }
  function addTask() {
    const original=input.value.trim(); if (!original) { input.focus(); return; }
    const reminder=parseTime(original);
    tasks.unshift({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()), title:cleanTitle(original), original, reminderAt:reminder?reminder.toISOString():null, completed:false, createdAt:new Date().toISOString()});
    save(); render(); input.value=''; input.focus();
  }
  addButton.addEventListener('click',addTask);
  input.addEventListener('keydown',event=>{if(event.key==='Enter') addTask();});
  groupsRoot.addEventListener('click',event=>{
    const toggle=event.target.closest('[data-toggle]'); const remove=event.target.closest('[data-delete]'); const ics=event.target.closest('[data-ics]');
    if(toggle){const task=tasks.find(t=>t.id===toggle.dataset.toggle);if(task){task.completed=!task.completed;save();render();}}
    if(remove){tasks=tasks.filter(t=>t.id!==remove.dataset.delete);save();render();}
    if(ics){const task=tasks.find(t=>t.id===ics.dataset.ics);if(task) downloadIcs(task);}
  });
  function downloadIcs(task) {
    const start=new Date(task.reminderAt), end=new Date(start.getTime()+30*60000);
    const utc=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const esc=value=>String(value).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
    const content=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Voice Task Reminder//ZH-TW','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${task.id}@voice-task-reminder`,`DTSTAMP:${utc(new Date())}`,`DTSTART:${utc(start)}`,`DTEND:${utc(end)}`,`SUMMARY:${esc(task.title)}`,`DESCRIPTION:${esc(`原始輸入：${task.original}`)}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const blob=new Blob([content],{type:'text/calendar;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='voice-task-reminder.ics'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.addEventListener('click',()=>{voiceStatus.textContent='此瀏覽器不支援語音輸入，請改用打字';});
  } else {
    const recognition=new SpeechRecognition(); recognition.lang='zh-TW'; recognition.interimResults=false; recognition.continuous=false;
    let listening=false;
    voiceButton.addEventListener('click',()=>{
      if(listening){recognition.stop();return;}
      voiceStatus.textContent='';
      try{recognition.start();}catch{voiceStatus.textContent='語音輸入目前無法啟動，請稍後再試或改用打字';}
    });
    recognition.onstart=()=>{listening=true;voiceButton.classList.add('listening');voiceLabel.textContent='聆聽中...';};
    recognition.onresult=event=>{input.value=event.results[0][0].transcript;input.focus();};
    recognition.onerror=event=>{if(event.error==='not-allowed')voiceStatus.textContent='請允許麥克風權限後再試';else if(event.error==='no-speech')voiceStatus.textContent='沒有聽到語音，請再試一次';};
    recognition.onend=()=>{listening=false;voiceButton.classList.remove('listening');voiceLabel.textContent='語音輸入';};
  }
  render();
})();
