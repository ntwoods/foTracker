/* =============================
   CONFIG
============================= */
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw7KGvbKAsjitbDE9aHvt_Udntj0Us7Hw9uennXJF6Tp2a2KbkW1rpape-b5zgm7weyhQ/exec";

/* =============================
   Utilities
============================= */
const $ = (id) => document.getElementById(id);

function toast(msg, dur = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), dur);
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || "";
}

// Convert File to Base64 (no prefix)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result; // data:<mime>;base64,XXXX
      const base64 = (result || "").toString().split(",")[1] || "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Format date-time short display
function fmtDT(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", { hour12: false });
  } catch {
    return iso;
  }
}

/* =============================
   State
============================= */
let salespersonName = "";
let currentOpenCheckin = null; // object returned by backend (open = no checkout yet)

/* =============================
   DOM Elements
============================= */
const salespersonNameText = $("salespersonNameText");
const btnCheckIn = $("btnCheckIn");
const btnCheckOut = $("btnCheckOut");
const checkinFormWrap = $("checkinFormWrap");
const checkinForm = $("checkinForm");
const checkoutFormWrap = $("checkoutFormWrap");
const checkoutForm = $("checkoutForm");
const cancelCheckin = $("cancelCheckin");
const cancelCheckout = $("cancelCheckout");
const routeSel = $("route");
const modeSel = $("mode");
const bikeFields = $("bikeFields");
const bikeReading = $("bikeReading");
const bikeOdoImage = $("bikeOdoImage");
const bikeCheckoutFields = $("bikeCheckoutFields");
const bikeReadingOut = $("bikeReadingOut");
const bikeOdoImageOut = $("bikeOdoImageOut");
const busFields = $("busFields");
const checkinSummary = $("checkinSummary");

/* =============================
   Init
============================= */
document.addEventListener("DOMContentLoaded", async () => {
  salespersonName = decodeURIComponent(getQueryParam("salespersonName") || "").trim();
  salespersonNameText.textContent = salespersonName || "Unknown";

  // Load routes for today
  await loadRoutesForToday();

  // Load open check-in (if any)
  await refreshCurrentCheckinUI();

  // Wire buttons
  btnCheckIn.addEventListener("click", () => {
    checkinForm.reset();
    modeSel.value = "";
    bikeFields.classList.add("hidden");
    checkinFormWrap.classList.remove("hidden");
    checkoutFormWrap.classList.add("hidden");
  });

  btnCheckOut.addEventListener("click", () => {
    if (!currentOpenCheckin) return;
    checkoutForm.reset();
    // Show appropriate fields based on stored mode
    const mode = currentOpenCheckin.mode || "";
    busFields.classList.toggle("hidden", mode !== "Bus");
    bikeCheckoutFields.classList.toggle("hidden", mode !== "Bike");
    checkoutFormWrap.classList.remove("hidden");
    checkinFormWrap.classList.add("hidden");
  });

  cancelCheckin.addEventListener("click", () => {
    checkinFormWrap.classList.add("hidden");
  });

  cancelCheckout.addEventListener("click", () => {
    checkoutFormWrap.classList.add("hidden");
  });

  // Mode switch in Check-In form
  modeSel.addEventListener("change", () => {
    const mode = modeSel.value;
    if (mode === "Bike") {
      bikeFields.classList.remove("hidden");
      // Mark bike fields required
      bikeReading.required = true;
      bikeOdoImage.required = true;
    } else {
      bikeFields.classList.add("hidden");
      bikeReading.required = false;
      bikeOdoImage.required = false;
    }
  });

  // Submit Check-In
  checkinForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const route = routeSel.value.trim();
      const mode = modeSel.value;

      if (!route) return toast("Please select Route");
      if (!mode) return toast("Please select Mode");

      let bikeReadingVal = "";
      let bikeOdoBase64 = "";
      if (mode === "Bike") {
        bikeReadingVal = (bikeReading.value || "").trim();
        if (!bikeReadingVal) return toast("Bike reading is required");
        const file = bikeOdoImage.files[0];
        if (!file) return toast("Odometer image is required");
        bikeOdoBase64 = await fileToBase64(file);
      }

      const payload = {
        action: "checkin",
        salespersonName,
        route,
        mode,
        bikeReading: bikeReadingVal,
        bikeOdoImageBase64: bikeOdoBase64
      };

      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      toast("Check-In recorded");
      checkinFormWrap.classList.add("hidden");
      // Refresh open check-in summary & show Check-Out button
      await refreshCurrentCheckinUI();
    } catch (err) {
      console.error(err);
      toast("Error: " + err.message);
    }
  });

  // Submit Check-Out
  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentOpenCheckin) return;

    try {
      const mode = currentOpenCheckin.mode;
      const common = {
        foodExpense: (document.getElementById("foodExpense").value || "").trim(),
        autoExpense: (document.getElementById("autoExpense").value || "").trim()
      };

      let extra = {};
      if (mode === "Bus") {
        const price = (document.getElementById("busTicketPrice").value || "").trim();
        if (!price) return toast("Bus ticket price is required");
        const file = document.getElementById("busTicketImage").files[0];
        if (!file) return toast("Bus ticket image is required");
        const base64 = await fileToBase64(file);
        extra = { busTicketPrice: price, busTicketImageBase64: base64 };
      } else if (mode === "Bike") {
        const readingOut = (bikeReadingOut.value || "").trim();
        if (!readingOut) return toast("Bike end reading is required");
        const file = bikeOdoImageOut.files[0];
        if (!file) return toast("End odometer image is required");
        const base64 = await fileToBase64(file);
        extra = { bikeReadingOut: readingOut, bikeOdoImageOutBase64: base64 };
      }

      const payload = {
        action: "checkout",
        salespersonName,
        checkinId: currentOpenCheckin.checkinId,
        ...common,
        ...extra
      };

      const res = await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",          
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      toast("Check-Out recorded");
      checkoutFormWrap.classList.add("hidden");
      await refreshCurrentCheckinUI();
    } catch (err) {
      console.error(err);
      toast("Error: " + err.message);
    }
  });
});

/* =============================
   Backend Calls
============================= */
async function loadRoutesForToday() {
  try {
    const url = new URL(SCRIPT_URL);
    url.searchParams.set("action", "routes");
    if (salespersonName) url.searchParams.set("salespersonName", salespersonName);

    const res = await fetch(url.toString(), { method: "GET" });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Failed to fetch routes");

    routeSel.innerHTML = `<option value="">Select Route</option>`;
    (data.routes || []).forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      routeSel.appendChild(opt);
    });
  } catch (err) {
    console.error(err);
    routeSel.innerHTML = `<option value="">(No routes found)</option>`;
    toast("Couldn’t load routes");
  }
}

async function refreshCurrentCheckinUI() {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set("action", "currentCheckin");
  if (salespersonName) url.searchParams.set("salespersonName", salespersonName);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();

  currentOpenCheckin = null;
  btnCheckOut.classList.add("hidden");
  $("homeActions").classList.remove("hidden");

  if (data.ok && data.current) {
    currentOpenCheckin = data.current;

    const html =
      `<div><strong>Checked-In:</strong> ${fmtDT(data.current.checkinTime)}</div>` +
      `<div><strong>Route:</strong> ${data.current.route}</div>` +
      `<div><strong>Mode:</strong> ${data.current.mode}</div>`;

    checkinSummary.innerHTML = html;
    checkinSummary.classList.remove("hidden");

    // Show Check-Out button only when open check-in exists
    btnCheckOut.classList.remove("hidden");
  } else {
    checkinSummary.classList.add("hidden");
  }
}
