function initGallery({ images, trackId, prevId, nextId, galleryId }) {

  const track = document.getElementById(trackId);
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);
  const gallery = document.getElementById(galleryId);
  const counter = document.getElementById("galleryCounter");

  if (!track || !gallery) return;

  track.innerHTML = "";

  if (!images || images.length === 0) {
    images = ["/img/offer-default.png"];
  }

  let currentIndex = 0;
  let startX = 0;
  let currentTranslate = 0;
  let prevTranslate = 0;
  let isDragging = false;
const singleImage = images.length <= 1;
  images.forEach(src => {

    const slide = document.createElement("div");
    slide.className = "tp-gallery__slide";

    const img = document.createElement("img");
    img.src = src;
    img.draggable = false;

    slide.appendChild(img);
    track.appendChild(slide);

  });

  function updateCounter(){
    if(counter){
      counter.textContent = `${currentIndex + 1} / ${images.length}`;
    }
  }

  function setPosition(){
    track.style.transform = `translateX(${currentTranslate}px)`;
  }

  function animate(){
    setPosition();
    if(isDragging) requestAnimationFrame(animate);
  }

  function setSlide(index){

    const width = gallery.clientWidth;

    currentIndex = Math.max(0, Math.min(index, images.length - 1));

    currentTranslate = -currentIndex * width;
    prevTranslate = currentTranslate;

    track.style.transition = "transform .35s ease";
    setPosition();

    updateCounter();

    if(prevBtn){
      prevBtn.style.display = currentIndex > 0 ? "flex" : "none";
    }

    if(nextBtn){
      nextBtn.style.display = currentIndex < images.length - 1 ? "flex" : "none";
    }

  }

  /* ===== BUTTONS ===== */

  if(prevBtn){
    prevBtn.onclick = () => setSlide(currentIndex - 1);
  }

  if(nextBtn){
    nextBtn.onclick = () => setSlide(currentIndex + 1);
  }

  /* ===== DRAG ===== */

function touchStart(e){

  if(singleImage) return;

  startX = e.type.includes("mouse") ? e.pageX : e.touches[0].clientX;
  isDragging = true;
  track.style.transition = "none";
  requestAnimationFrame(animate);
}

function touchMove(e){

  if(!isDragging) return;

  const x = e.type.includes("mouse") ? e.pageX : e.touches[0].clientX;
  const diff = x - startX;

  const width = gallery.clientWidth;

  let move = prevTranslate + diff;

  // ❗ блокируем влево на первом фото
  if(currentIndex === 0 && diff > 0){
    move = prevTranslate;
  }

  // ❗ блокируем вправо на последнем фото
  if(currentIndex === images.length - 1 && diff < 0){
    move = prevTranslate;
  }

  currentTranslate = move;
}

function touchEnd(){

  if(singleImage){
    isDragging = false;
    return;
  }

  isDragging = false;

  const moved = currentTranslate - prevTranslate;
  const width = gallery.clientWidth;

  if(moved < -80 && currentIndex < images.length - 1) currentIndex++;
  if(moved > 80 && currentIndex > 0) currentIndex--;

  setSlide(currentIndex);
}

  gallery.addEventListener("touchstart", touchStart);
  gallery.addEventListener("touchmove", touchMove);
  gallery.addEventListener("touchend", touchEnd);

  gallery.addEventListener("mousedown", touchStart);
  gallery.addEventListener("mousemove", touchMove);
  gallery.addEventListener("mouseup", touchEnd);
  gallery.addEventListener("mouseleave", touchEnd);

  window.addEventListener("resize", () => setSlide(currentIndex));

  setSlide(0);
}