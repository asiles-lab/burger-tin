const form=document.querySelector('#withdrawal-form');
let requestId=crypto.randomUUID();
form.addEventListener('submit',async e=>{e.preventDefault();const button=form.querySelector('button'),status=document.querySelector('#withdrawal-status');button.disabled=true;try{
 const config=window.RESTIA_CLIENT_CONFIG||window.BURGER_TIN_CHECKOUT||{};
 const response=await fetch(`${String(config.apiBaseUrl||'').replace(/\/$/,'')}/api/glowro/withdrawal`,{method:'POST',headers:{'content-type':'application/json','x-requested-with':'restia-web'},body:JSON.stringify({orderCode:form.elements.orderCode.value.trim(),email:form.elements.email.value.trim(),requestId})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'No pudimos registrar tu solicitud.');
 status.textContent=`${data.message} Número: ${data.id}`;form.hidden=true;status.focus();
}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
