export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const BUSINESS_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const DAY_LABELS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAY_BY_SHORT_NAME = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function defaultBusinessHours() {
  return {
    enabled:false,
    timeZone:BUSINESS_TIME_ZONE,
    days:Object.fromEntries(BUSINESS_DAY_KEYS.map(key => [key, { enabled:false, open:'18:00', close:'23:59' }]))
  };
}

export function normalizeBusinessHours(value) {
  const source = value && typeof value === 'object' ? value : {};
  const fallback = defaultBusinessHours();
  const days = Object.fromEntries(BUSINESS_DAY_KEYS.map(key => {
    const day = source.days?.[key];
    return [key, {
      enabled:Boolean(day?.enabled),
      open:TIME_PATTERN.test(String(day?.open || '')) ? String(day.open) : fallback.days[key].open,
      close:TIME_PATTERN.test(String(day?.close || '')) ? String(day.close) : fallback.days[key].close
    }];
  }));
  return { enabled:Boolean(source.enabled), timeZone:BUSINESS_TIME_ZONE, days };
}

export function validateBusinessHours(value) {
  const schedule = normalizeBusinessHours(value);
  if (!schedule.enabled) return schedule;
  const activeDays = BUSINESS_DAY_KEYS.filter(key => schedule.days[key].enabled);
  if (!activeDays.length) throw new Error('Activá al menos un día para aplicar los horarios.');
  for (const key of activeDays) {
    const day = schedule.days[key];
    if (!TIME_PATTERN.test(day.open) || !TIME_PATTERN.test(day.close) || day.open === day.close) {
      throw new Error(`Revisá el horario del ${DAY_LABELS[BUSINESS_DAY_KEYS.indexOf(key)]}.`);
    }
  }
  return schedule;
}

function localClock(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday:'short',
    hour:'2-digit',
    minute:'2-digit',
    hourCycle:'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return { day:DAY_BY_SHORT_NAME[parts.weekday], minutes:Number(parts.hour) * 60 + Number(parts.minute) };
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

export function orderingAvailability(value, now = new Date()) {
  const schedule = normalizeBusinessHours(value);
  if (!schedule.enabled) return { open:true, scheduleEnabled:false, message:'Pedidos habilitados', nextOpen:null };
  const clock = localClock(now, schedule.timeZone);
  const today = schedule.days[BUSINESS_DAY_KEYS[clock.day]];
  const previousIndex = (clock.day + 6) % 7;
  const previous = schedule.days[BUSINESS_DAY_KEYS[previousIndex]];
  const todayOpen = timeToMinutes(today.open), todayClose = timeToMinutes(today.close);
  const previousOpen = timeToMinutes(previous.open), previousClose = timeToMinutes(previous.close);
  const openToday = today.enabled && (todayClose > todayOpen
    ? clock.minutes >= todayOpen && clock.minutes < todayClose
    : clock.minutes >= todayOpen);
  const openFromYesterday = previous.enabled && previousClose <= previousOpen && clock.minutes < previousClose;
  if (openToday || openFromYesterday) return { open:true, scheduleEnabled:true, message:'Abierto para pedidos', nextOpen:null };

  let next = null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const dayIndex = (clock.day + offset) % 7;
    const day = schedule.days[BUSINESS_DAY_KEYS[dayIndex]];
    if (!day.enabled) continue;
    const distance = offset * 1440 + timeToMinutes(day.open) - clock.minutes;
    if (distance <= 0) continue;
    if (!next || distance < next.distance) next = { distance, dayIndex, time:day.open };
  }
  const nextOpen = next
    ? `${next.dayIndex === clock.day ? 'hoy' : next.dayIndex === (clock.day + 1) % 7 ? 'mañana' : `el ${DAY_LABELS[next.dayIndex]}`} a las ${next.time} hs`
    : null;
  return {
    open:false,
    scheduleEnabled:true,
    message:nextOpen ? `Local cerrado · Abrimos ${nextOpen}` : 'Local cerrado',
    nextOpen
  };
}
