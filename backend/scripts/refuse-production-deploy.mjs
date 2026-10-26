console.error([
  'DEPLOY BLOQUEADO: este backend es una copia histórica.',
  'La única fuente de producción es:',
  '../../restia-glowro-commerce/backend',
  'Publicá desde ese directorio para conservar el aislamiento multiempresa.'
].join('\n'));
process.exit(1);
