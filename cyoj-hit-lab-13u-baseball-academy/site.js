(()=>{
  const choices=[...document.querySelectorAll('.choice')];
  const planDetails=document.getElementById('plan-details');
  const fullDetails=document.getElementById('full-details');
  const guardian=document.getElementById('guardian');
  const terms=document.getElementById('terms');
  const checkout=document.getElementById('checkout');
  const summaryTitle=document.getElementById('summary-title');
  const summaryPrice=document.getElementById('summary-price');
  const fullLink='https://buy.stripe.com/eVq14naqS4Io5h40Ke48004';
  let selected='plan';
  let busy=false;

  function refresh(){
    const ok=guardian.checked&&terms.checked&&!busy;
    checkout.classList.toggle('disabled',!ok);
    checkout.setAttribute('aria-disabled',String(!ok));
    checkout.tabIndex=ok?0:-1;
  }

  choices.forEach(button=>button.addEventListener('click',()=>{
    selected=button.dataset.plan;
    choices.forEach(item=>{
      const active=item===button;
      item.classList.toggle('selected',active);
      item.setAttribute('aria-pressed',String(active));
    });
    const isPlan=selected==='plan';
    planDetails.classList.toggle('hidden',!isPlan);
    fullDetails.classList.toggle('hidden',isPlan);
summaryTitle.textContent=isPlan?'Installment plan':'Pay in full';
summaryPrice.textContent=isPlan?'$1,000':'$1,995';
  }));

  [guardian,terms].forEach(el=>el.addEventListener('change',refresh));

  checkout.addEventListener('click',async event=>{
    event.preventDefault();
    if(checkout.classList.contains('disabled')||busy) return;

    if(selected==='full'){
      window.location.assign(fullLink);
      return;
    }

    busy=true;
    refresh();
    const originalText=checkout.textContent;
    checkout.textContent='Opening secure Stripe checkout...';

    try{
      const attemptId=(globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response=await fetch('/api/create-installment-checkout',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          guardianAuthorized:true,
          installmentTermsAccepted:true,
          agreementVersion:'2026-08-25-v1',
          attemptId
        })
      });
      const data=await response.json();
      if(!response.ok||!data.url) throw new Error(data.error||'Unable to create checkout');
      window.location.assign(data.url);
    }catch(error){
      busy=false;
      checkout.textContent=originalText;
      refresh();
      alert('We could not open Stripe checkout. Please try again or email academyteams@cyojhitlab.com.');
      console.error(error);
    }
  });

  refresh();
})();
