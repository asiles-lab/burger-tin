import test from 'node:test';
import assert from 'node:assert/strict';
import { orderingAvailability, validateBusinessHours } from '../src/business-hours.js';

function schedule(days, enabled = true) {
  return { enabled, days };
}

test('sin horarios configurados mantiene los pedidos habilitados', () => {
  assert.equal(orderingAvailability(null, new Date('2026-10-27T15:00:00Z')).open, true);
});

test('abre y cierra un turno normal en hora argentina', () => {
  const hours = schedule({ tue:{ enabled:true, open:'18:00', close:'23:00' } });
  assert.equal(orderingAvailability(hours, new Date('2026-10-27T22:00:00Z')).open, true);
  assert.equal(orderingAvailability(hours, new Date('2026-10-28T03:00:00Z')).open, false);
});

test('admite turnos que cruzan la medianoche', () => {
  const hours = schedule({ fri:{ enabled:true, open:'19:00', close:'02:00' } });
  assert.equal(orderingAvailability(hours, new Date('2026-10-31T04:00:00Z')).open, true);
  assert.equal(orderingAvailability(hours, new Date('2026-10-31T06:00:00Z')).open, false);
});

test('exige al menos un día cuando se activa el control', () => {
  assert.throws(() => validateBusinessHours(schedule({})), /al menos un día/i);
});

test('si el turno de hoy ya pasó informa la próxima semana', () => {
  const hours = schedule({ tue:{ enabled:true, open:'18:00', close:'19:00' } });
  const result = orderingAvailability(hours, new Date('2026-10-28T01:00:00Z'));
  assert.equal(result.open, false);
  assert.match(result.nextOpen, /martes/);
  assert.doesNotMatch(result.nextOpen, /hoy/);
});
