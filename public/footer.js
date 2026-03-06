fetch("/footer.html", { cache: "no-cache" })
  .then(res => res.text())
  .then(html => {
    const el = document.getElementById("footer-container");
el.innerHTML = html;

if (window.tpI18n?.apply) {
  window.tpI18n.apply(el);
}

setActiveFooterLink();   // ← добавили

initCookieBanner();
  });

window.addEventListener("tp:lang-change", () => {
  const el = document.getElementById("footer-container");
  if (el && window.tpI18n?.apply) {
    window.tpI18n.apply(el);
  }
});

function initCookieBanner(){

  const KEY = "tp_cookie_consent";
  const banner = document.getElementById("cookie-banner");
  if(!banner) return;

  const acceptBtn = document.getElementById("cookie-accept");
  const essentialBtn = document.getElementById("cookie-essential");

  function showBanner(){
    banner.classList.remove("hidden");
  }

  function hideBanner(){
    banner.classList.add("hidden");
  }

  function saveConsent(type){
    localStorage.setItem(KEY, type);
    hideBanner();

    if(type === "all"){
      loadAnalytics();
    }
  }

  function loadAnalytics(){
    if(window.tpAnalyticsLoaded) return;
    window.tpAnalyticsLoaded = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXX";
    document.head.appendChild(script);

    script.onload = function(){
      window.dataLayer = window.dataLayer || [];
      function gtag(){ dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', 'G-XXXXXXXX');
    };
  }

  const saved = localStorage.getItem(KEY);

  if(!saved){
    setTimeout(showBanner, 600);
  } else if(saved === "all"){
    loadAnalytics();
  }

  acceptBtn?.addEventListener("click", () => {
    saveConsent("all");
  });

  essentialBtn?.addEventListener("click", () => {
    saveConsent("essential");
  });
}
// ===== ACTIVE FOOTER LINK =====
function setActiveFooterLink(){

  const path = location.pathname;

  document.querySelectorAll(".footer-links a").forEach(link => {

    const href = link.getAttribute("href");
    if(!href) return;

    const clean = href.replace(".html","");

    if(path.includes(clean)){
      link.classList.add("active");
    }

  });

}