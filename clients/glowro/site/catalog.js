// Fuente: tienda GlowRo enlazada desde @glowro_. Consulta: 15/10/2026.
// Precios de referencia de la portada de ML, que puede omitir centavos.
const CATALOG_DATE = '15/10/2026';
const STORE_URL = 'https://www.mercadolibre.com.ar/pagina/jcetn5tr';
const PRODUCTS = [
 ['MLA3273725744','Kit facial completo BE · Hidratación y luminosidad','kits',67991.50,79990,'kit-facial-completo-be--hidratacion-luminosidad/up/MLAU3935961589','879218-MLA110297395762_052026','Sérum humectante, crema ligera, gel de limpieza y tónico exfoliante.'],
 ['MLA3268197470','Rutina de día y noche antiage · 5 pasos','kits',59391,65990,'rutina-de-dia-y-noche-antiage-5-pasos-dr-duval/up/MLAU3932699589','811152-MLA118975818549_102026','Kit Dr. Duval. Consultá el contenido completo en la publicación.'],
 ['MLA1871516611','Combo sérum + crema hidratante BE','kits',40350,null,'combo-serum--crema-hidratante-be--dr-duval-rutina-facial/up/MLAU4193529689','729396-MLA119110010175_102026','Dos productos Dr. Duval para tu rutina facial.'],
 ['MLA3590377816','Combo retinol · Sérum + crema de noche','kits',45250,null,'combo-retinol-anti-edad-serum--crema-noche-dr-duval/up/MLAU4267211427','913917-MLA114388006301_072026','Combo Dr. Duval de cuidado nocturno.'],
 ['MLA2057761893','Set de limpieza facial profunda · 4 productos','kits',51590,null,'set-skincare-limpieza-facial-profunda-dr-duval-x4-productos/up/MLAU5096988646','619035-MLA117077183981_092026','Set Dr. Duval para una rutina de limpieza facial profunda.'],
 ['MLA3922754008','Kit facial Gold · Firmeza y luminosidad','kits',49990,null,'kit-facial-gold-antiedad-dr-duval--firmeza-y-luminosidad/up/MLAU5135485390','619897-MLA115853121412_092026','Kit facial antiedad Dr. Duval.'],
 ['MLA1816654927','Sérum hidratante BE · Aloe vera + vitamina E','facial',12490,null,'serum-hidratante-be-dr-duval-aloe-vera-vitamina-e-30ml/up/MLAU4038542261','697084-MLA112700537257_062026','30 ml · Dr. Duval · Día y noche.'],
 ['MLA3540591174','Sérum humectante BE · Ácido hialurónico','facial',12351,null,'serum-humectante-be-dr-duval-acido-hialuronico-30ml/up/MLAU4196311640','917511-MLA112771612636_062026','30 ml · Dr. Duval · Día y noche.'],
 ['MLA1919960989','Gel de ácido hialurónico + vitamina C','facial',16510,18345,'gel-acido-hialuronico-dr-duval--vitamina-c-50gr/up/MLAU4436782516','667685-MLA113782014508_072026','50 g · Dr. Duval · Cuidado facial.'],
 ['MLA1852505259','Sérum retinol 0,15% + vitamina C','facial',14240,14990,'serum-retinol-015-vit-c-antiage-facial-dr-duval-30ml/up/MLAU4153853070','624116-MLA113677188951_062026','30 ml · Dr. Duval · Uso nocturno.'],
 ['MLA3747021162','Crema de ordeñe Plus','corporal',16191,17990,'crema-de-ordene-plus-dr-duval-500g/p/MLA23759623','849848-MLA84174871524_052025','500 g · Dr. Duval.'],
 ['MLA1814239591','Crema sedante con camomila','corporal',8999,null,'dr-duval-crema-sedante-descongestiva-con-camomila-250-g-estetica/p/MLA21257621','759106-MLA93401379240_092025','250 g · Dr. Duval.']
].map(([id,name,category,price,previous,path,photo,description]) => ({id,name,category,price,previous,description,url:`https://www.mercadolibre.com.ar/${path}?pdp_filters=item_id%3A${id}`,image:`https://http2.mlstatic.com/D_Q_NP_2X_${photo}-AB.webp`}));
