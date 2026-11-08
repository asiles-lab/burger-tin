const MAX_SHIPPING_ZONES = 20;

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const normalizeToken = value => cleanText(value, 80).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const toList = (value, maxItems = 30) => {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
  return [...new Set(source.map(item => cleanText(item, 80)).filter(Boolean))].slice(0, maxItems);
};
const optionalMoney = value => value === '' || value === null || value === undefined ? null : Number(value);
const validMoney = value => Number.isFinite(value) && value >= 0 && value <= 1000000 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001;

function legacyShippingConfig(legacy = {}) {
  const fee = optionalMoney(legacy.deliveryFee);
  const areas = toList(legacy.deliveryZones);
  const address = cleanText(legacy.pickupAddress, 200);
  return {
    version: 1,
    pickup: { enabled:false, address, instructions:'' },
    delivery: {
      enabled: validMoney(fee),
      freeAbove: null,
      zones: validMoney(fee) ? [{
        id:'legacy-zone',
        name:areas.length ? 'Cobertura actual' : 'Envío a domicilio',
        areas,
        postalCodes:[],
        allLocations:!areas.length,
        fee
      }] : []
    },
    coordinate: { enabled:false, instructions:'' }
  };
}

export function normalizeShippingConfig(source, legacy = {}) {
  const fallback = legacyShippingConfig(legacy);
  if (!source || typeof source !== 'object') return fallback;
  const pickup = source.pickup && typeof source.pickup === 'object' ? source.pickup : {};
  const delivery = source.delivery && typeof source.delivery === 'object' ? source.delivery : {};
  const coordinate = source.coordinate && typeof source.coordinate === 'object' ? source.coordinate : {};
  const zones = Array.isArray(delivery.zones) ? delivery.zones.slice(0, MAX_SHIPPING_ZONES).map((zone, index) => {
    const fee = optionalMoney(zone?.fee);
    return {
      id:/^[a-z0-9][a-z0-9-]{0,49}$/i.test(String(zone?.id || '')) ? String(zone.id) : `zone-${index + 1}`,
      name:cleanText(zone?.name, 60),
      areas:toList(zone?.areas),
      postalCodes:toList(zone?.postalCodes).map(code => code.replace(/\s+/g, '').toUpperCase()),
      allLocations:Boolean(zone?.allLocations),
      fee:validMoney(fee) ? fee : 0
    };
  }) : [];
  const freeAbove = optionalMoney(delivery.freeAbove);
  return {
    version:1,
    pickup:{
      enabled:Boolean(pickup.enabled),
      address:cleanText(pickup.address ?? fallback.pickup.address, 200),
      instructions:cleanText(pickup.instructions, 500)
    },
    delivery:{
      enabled:Boolean(delivery.enabled),
      freeAbove:validMoney(freeAbove) && freeAbove > 0 ? freeAbove : null,
      zones
    },
    coordinate:{
      enabled:Boolean(coordinate.enabled),
      instructions:cleanText(coordinate.instructions, 500)
    }
  };
}

export function validateShippingConfig(source, legacy = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Revisá la configuración de envíos.');
  if (Array.isArray(source.delivery?.zones) && source.delivery.zones.length > MAX_SHIPPING_ZONES) throw new Error(`Podés configurar hasta ${MAX_SHIPPING_ZONES} zonas.`);
  for (const zone of source.delivery?.zones || []) {
    if (!validMoney(optionalMoney(zone?.fee))) throw new Error(`Revisá la tarifa de “${cleanText(zone?.name, 60) || 'la zona'}”.`);
  }
  const requestedFreeAbove = optionalMoney(source.delivery?.freeAbove);
  if (requestedFreeAbove !== null && (!validMoney(requestedFreeAbove) || requestedFreeAbove === 0)) throw new Error('Revisá el monto para el envío gratuito.');
  const config = normalizeShippingConfig(source, legacy);
  if (!config.pickup.enabled && !config.delivery.enabled && !config.coordinate.enabled) throw new Error('Activá al menos un método de entrega.');
  if (config.pickup.enabled && config.pickup.address.length < 5) throw new Error('Ingresá la dirección del punto de retiro.');
  if (config.delivery.enabled && !config.delivery.zones.length) throw new Error('Agregá al menos una zona para el envío a domicilio.');
  for (const zone of config.delivery.zones) {
    if (zone.name.length < 2) throw new Error('Cada zona necesita un nombre.');
    if (!zone.allLocations && !zone.areas.length && !zone.postalCodes.length) throw new Error(`Indicá localidades o códigos postales para “${zone.name}”.`);
  }
  return config;
}

function matchingZone(zones, locality, postalCode) {
  const normalizedLocality = normalizeToken(locality);
  const normalizedPostalCode = String(postalCode || '').replace(/\s+/g, '').toUpperCase();
  return zones.find(zone => zone.allLocations
    || (normalizedPostalCode && zone.postalCodes.some(code => code === normalizedPostalCode))
    || (normalizedLocality && zone.areas.some(area => normalizeToken(area) === normalizedLocality)));
}

export function shippingMethodsForCart(config, { subtotal, locality = '', postalCode = '' } = {}) {
  const total = Number(subtotal);
  if (!Number.isFinite(total) || total < 0) throw new Error('No pudimos calcular el total del carrito.');
  const methods = [];
  if (config.pickup.enabled) methods.push({
    id:'pickup',
    label:'Retiro en punto de entrega',
    fee:0,
    address:config.pickup.address,
    description:config.pickup.instructions
  });
  if (config.delivery.enabled) {
    const zone = matchingZone(config.delivery.zones, locality, postalCode);
    if (zone) {
      const free = config.delivery.freeAbove !== null && total >= config.delivery.freeAbove;
      methods.push({
        id:'delivery',
        label:'Envío a domicilio',
        fee:free ? 0 : zone.fee,
        zoneId:zone.id,
        zoneName:zone.name,
        description:free ? `Envío bonificado desde $ ${config.delivery.freeAbove.toLocaleString('es-AR')}` : `Tarifa para ${zone.name}`
      });
    }
  }
  if (config.coordinate.enabled) methods.push({
    id:'coordinate',
    label:'Envío a coordinar',
    fee:null,
    requiresCoordination:true,
    description:config.coordinate.instructions || 'El costo y la modalidad se confirman después de realizar el pedido.'
  });
  return methods;
}

export function publicShippingConfig(config) {
  return {
    pickup:{ enabled:config.pickup.enabled, address:config.pickup.address, instructions:config.pickup.instructions },
    delivery:{
      enabled:config.delivery.enabled,
      freeAbove:config.delivery.freeAbove,
      zones:config.delivery.zones.map(zone => ({ id:zone.id, name:zone.name, areas:zone.areas, postalCodes:zone.postalCodes, allLocations:zone.allLocations }))
    },
    coordinate:{ enabled:config.coordinate.enabled, instructions:config.coordinate.instructions }
  };
}
