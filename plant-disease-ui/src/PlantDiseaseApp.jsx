import { useState, useRef, useCallback, useEffect } from "react";

/* ─────────────────────────────────────────────
   CONFIG & DATA
───────────────────────────────────────────────*/
const DEFAULT_API_URL = "http://localhost:8000";

const CROP_EMOJI = { Potato: "🥔", Rice: "🌾", Tomato: "🍅", Wheat: "🌿", sugarcane: "🎋" };
const CROP_LABEL = { Potato: "Khoai tây", Rice: "Lúa", Tomato: "Cà chua", Wheat: "Lúa mì", sugarcane: "Mía" };

// Giữ nguyên toàn bộ data khoa học của bạn (được rút gọn cách trình bày để code ngắn hơn)
const DISEASE_INFO = {
  healthy: { name: "Khỏe mạnh", severity: "none", icon: "✦", cause: "—", short: "Cây sinh trưởng bình thường, không có dấu hiệu bệnh lý.", treatment: "Tiếp tục chăm sóc theo đúng quy trình: tưới nước điều độ, bón phân cân đối, theo dõi định kỳ." },
  Healthy: { name: "Khỏe mạnh", severity: "none", icon: "✦", cause: "—", short: "Cây sinh trưởng bình thường, không có dấu hiệu bệnh lý.", treatment: "Tiếp tục chăm sóc theo đúng quy trình: tưới nước điều độ, bón phân cân đối, theo dõi định kỳ." },
  early_blight: { name: "Đốm lá sớm (Early Blight)", severity: "medium", icon: "◉", cause: "Nấm Alternaria solani", short: "Đốm nâu đồng tâm trên lá già, có viền vàng xung quanh.", treatment: "Phun Chlorothalonil hoặc Mancozeb. Tăng thông thoáng, tránh tưới lên lá." },
  late_blight: { name: "Mốc sương (Late Blight)", severity: "critical", icon: "▲", cause: "Nấm trứng Phytophthora infestans", short: "Đốm ướt màu xanh xám, nhanh chuyển nâu đen. Rất nguy hiểm.", treatment: "Loại bỏ và tiêu huỷ lá bệnh ngay. Phun Metalaxyl hoặc Mancozeb." },
  bacterial_spot: { name: "Đốm vi khuẩn (Bacterial Spot)", severity: "medium", icon: "◉", cause: "Vi khuẩn Xanthomonas spp.", short: "Đốm nhỏ nâu đen trên lá, quả và thân; có quầng vàng.", treatment: "Dùng thuốc gốc đồng (copper hydroxide). Tránh tưới phun lên lá. Luân canh 2–3 năm." },
  bacterial_wilt: { name: "Héo vi khuẩn (Bacterial Wilt)", severity: "critical", icon: "▲", cause: "Vi khuẩn Ralstonia solanacearum", short: "Cây héo đột ngột dù đất ẩm. Cắt thân thấy dịch nhờn trắng đục.", treatment: "Nhổ bỏ tiêu huỷ ngay. Xử lý đất bằng vôi. Luân canh cây không phải ký chủ 3 năm." },
  leaf_curl: { name: "Xoăn lá (Tomato Leaf Curl Virus)", severity: "high", icon: "◈", cause: "Tomato Leaf Curl Virus (TLCV)", short: "Lá xoăn cong lên, vàng hóa, cây còi cọc. Truyền qua bọ phấn trắng.", treatment: "Kiểm soát bọ phấn bằng Imidacloprid. Nhổ cây nhiễm nặng. Dùng lưới ngăn côn trùng." },
  mosaic_virus: { name: "Bệnh khảm (Mosaic Virus)", severity: "high", icon: "◈", cause: "Tomato Mosaic Virus (TMV) / Cucumber Mosaic Virus (CMV)", short: "Lá khảm màu vàng xanh xen kẽ, biến dạng.", treatment: "Không có thuốc đặc trị. Nhổ và tiêu huỷ cây bệnh. Kiểm soát rầy và bọ trĩ." },
  Mosaic: { name: "Bệnh khảm (Mosaic Virus)", severity: "high", icon: "◈", cause: "Tomato Mosaic Virus (TMV) / Cucumber Mosaic Virus (CMV)", short: "Lá khảm màu vàng xanh xen kẽ, biến dạng.", treatment: "Không có thuốc đặc trị. Nhổ và tiêu huỷ cây bệnh. Kiểm soát rầy và bọ trĩ." },
  blast: { name: "Bệnh đạo ôn (Blast)", severity: "high", icon: "◈", cause: "Nấm Magnaporthe oryzae", short: "Đốm hình mắt én trên lá, màu nâu vàng với viền nâu sẫm.", treatment: "Phun Tricyclazole hoặc Isoprothiolane khi phát hiện sớm. Giảm lượng phân đạm." },
  Leaf_Blast: { name: "Đạo ôn lá (Leaf Blast)", severity: "high", icon: "◈", cause: "Nấm Magnaporthe oryzae", short: "Đốm hình thoi trên lá lúa: tâm xám trắng, viền nâu vàng.", treatment: "Phun Tricyclazole 75WP. Giảm mật độ gieo và phân đạm. Thoát nước ruộng." },
  Neck_Blast: { name: "Đạo ôn cổ bông (Neck Blast)", severity: "critical", icon: "▲", cause: "Nấm Magnaporthe oryzae", short: "Thối cổ bông, bông lúa gãy gục hoặc không trỗ được.", treatment: "Phun phòng Tricyclazole hoặc Propiconazole trước khi lúa trỗ 5–7 ngày." },
  brown_spot: { name: "Đốm nâu lúa (Brown Spot)", severity: "medium", icon: "◉", cause: "Nấm Cochliobolus miyabeanus", short: "Đốm nâu hình tròn hoặc oval, có viền vàng; phổ biến khi cây thiếu dinh dưỡng.", treatment: "Bón kali đầy đủ. Phun Iprobenfos hoặc Mancozeb. Cải thiện độ phì đất." },
  tungro: { name: "Lúa vàng lùn (Tungro)", severity: "critical", icon: "▲", cause: "Phức hợp 2 virus (RTBV + RTSV)", short: "Lá vàng cam từ chóp vào gốc, cây lùn, đẻ nhánh ít.", treatment: "Kiểm soát rầy xanh bằng Imidacloprid. Nhổ bỏ cây bệnh. Dùng giống kháng rầy." },
  Yellow_Rust: { name: "Gỉ sắt vàng (Yellow Rust)", severity: "high", icon: "◈", cause: "Nấm Puccinia striiformis", short: "Sọc vàng dọc gân lá, bào tử vàng cam. Lây lan cực nhanh.", treatment: "Phun Propiconazole hoặc Tebuconazole ngay khi thấy triệu chứng. Dùng giống kháng." },
  Brown_Rust: { name: "Gỉ sắt nâu (Brown Rust)", severity: "medium", icon: "◉", cause: "Nấm Puccinia triticina", short: "Ổ bào tử nâu đỏ rải rác trên mặt lá, lây lan nhanh khi ấm áp.", treatment: "Phun Propiconazole hoặc Mancozeb khi mật độ bào tử tăng. Theo dõi thời tiết." },
  RedRot: { name: "Thối đỏ mía (Red Rot)", severity: "high", icon: "◈", cause: "Nấm Colletotrichum falcatum", short: "Bên trong thân mía có vết đỏ và đốm trắng xen kẽ, mùi chua rượu.", treatment: "Dùng hom giống sạch bệnh, xử lý bằng thuốc trừ nấm trước trồng. Luân canh." },
  Rust: { name: "Gỉ sắt mía (Sugarcane Rust)", severity: "medium", icon: "◉", cause: "Nấm Puccinia melanocephala", short: "Ổ bào tử màu nâu vàng trên mặt lá, sau chuyển nâu đen khi già.", treatment: "Phun Mancozeb hoặc Propiconazole. Thu hoạch sớm nếu bệnh ở mức nặng." },
  Yellow: { name: "Vàng lá mía (Yellow Leaf Disease)", severity: "medium", icon: "◉", cause: "Sugarcane Yellow Leaf Virus (SCYLV)", short: "Gân lá giữa vàng từ chóp xuống gốc, lá cờ vàng sớm.", treatment: "Kiểm soát rệp bằng Imidacloprid. Dùng hom giống sạch bệnh đã kiểm định." },
  BacterialBlights: { name: "Bạch mạch mía (Leaf Scald)", severity: "high", icon: "◈", cause: "Vi khuẩn Xanthomonas albilineans", short: "Sọc trắng dọc theo gân lá, cây còi hoặc chết đột ngột.", treatment: "Dùng hom giống sạch bệnh. Xử lý nhiệt ướt (50°C trong 2 giờ). Tiêu huỷ cây bệnh." },
  bacterial_blight: { name: "Bạc lá lúa (Bacterial Blight)", severity: "high", icon: "◈", cause: "Vi khuẩn Xanthomonas oryzae pv. oryzae", short: "Mép lá vàng, sau cháy trắng từ đầu lá vào. Khi ẩm thấy giọt dịch vàng.", treatment: "Giảm phân đạm. Dùng giống kháng. Phun Copper oxychloride hoặc Kasugamycin." },
  nematode: { name: "Tuyến trùng nốt rễ", severity: "medium", icon: "◉", cause: "Tuyến trùng Meloidogyne spp.", short: "Rễ có u nốt sưng, cây vàng và còi cọc, héo trong điều kiện khô.", treatment: "Luân canh với cây không phải ký chủ. Xử lý đất bằng Carbofuran. Bón hữu cơ." },
  pests: { name: "Sâu hại (Pest Damage)", severity: "medium", icon: "◉", cause: "Nhiều loài côn trùng gây hại", short: "Lỗ thủng trên lá, mô lá bị gặm; có thể thấy sâu hoặc phân trên lá.", treatment: "Kiểm tra ruộng thường xuyên. Phun thuốc trừ sâu đúng ngưỡng kinh tế." },
  phytophthora: { name: "Thối rễ Phytophthora", severity: "high", icon: "◈", cause: "Nấm trứng Phytophthora spp.", short: "Rễ và gốc thối nhũn màu nâu đen, cây héo và chết nhanh khi đất ẩm.", treatment: "Cải thiện hệ thống thoát nước. Tưới hoặc phun Metalaxyl. Tránh tưới thừa." },
  leafroll_virus: { name: "Virus cuốn lá (Leafroll Virus)", severity: "high", icon: "◈", cause: "Potato Leafroll Virus (PLRV)", short: "Lá cuốn dọc theo gân giữa, mép lá vàng, cây còi cọc.", treatment: "Không có thuốc đặc trị. Kiểm soát rầy đào bằng Imidacloprid." },
  leaf_mold: { name: "Nấm mốc lá cà chua (Leaf Mold)", severity: "medium", icon: "◉", cause: "Nấm Passalora fulva", short: "Mặt trên lá đốm vàng; mặt dưới có lớp mốc xám nâu đặc trưng.", treatment: "Tăng thông thoáng và giảm độ ẩm dưới 85%. Phun Mancozeb hoặc Chlorothalonil." },
  septoria_leaf_spot: { name: "Đốm lá Septoria", severity: "medium", icon: "◉", cause: "Nấm Septoria lycopersici", short: "Đốm nhỏ hình tròn màu nâu xám với tâm trắng, nhiều đốm trên lá già.", treatment: "Phun Chlorothalonil hoặc Mancozeb. Loại bỏ lá bệnh. Tránh tưới phun." },
  spider_mites: { name: "Nhện nhỏ đỏ (Spider Mites)", severity: "medium", icon: "◉", cause: "Nhện Tetranychus urticae", short: "Chấm trắng vàng nhỏ trên lá, tơ mỏng mặt dưới lá, lá khô cháy khi nặng.", treatment: "Phun Abamectin hoặc Spiromesifen. Tăng độ ẩm vườn. Phun nước mạnh rửa trôi nhện." },
  target_spot: { name: "Đốm vòng đồng tâm (Target Spot)", severity: "medium", icon: "◉", cause: "Nấm Corynespora cassiicola", short: "Đốm nâu với các vòng đồng tâm rõ ràng, thường ở lá già.", treatment: "Phun Azoxystrobin hoặc Fluxapyroxad. Tránh tưới phun lên lá." },
};

function getDiseaseInfo(folder) {
  if (folder.includes("___")) {
    const key = folder.split("___")[1];
    if (DISEASE_INFO[key]) return DISEASE_INFO[key];
  }
  const parts = folder.split("_");
  for (let i = 1; i <= parts.length - 1; i++) {
    const key = parts.slice(i).join("_");
    if (DISEASE_INFO[key]) return DISEASE_INFO[key];
  }
  return {
    name: folder.replace(/_/g, " "), severity: "unknown", icon: "?", cause: "—",
    short: "Chưa có thông tin chi tiết trong cơ sở dữ liệu.", treatment: "Liên hệ cán bộ khuyến nông địa phương để được tư vấn cụ thể."
  };
}

function parseFolderName(folder) { return getDiseaseInfo(folder).name; }

/* ─────────────────────────────────────────────
   API HELPERS
───────────────────────────────────────────────*/
async function checkHealth(apiUrl) {
  const res = await fetch(`${apiUrl}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error("Backend status không phải 'ok'");
  return data;
}

async function predict(imageDataUrl, apiUrl) {
  const base64 = imageDataUrl.split(",").pop();
  const res = await fetch(`${apiUrl}/predict`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64 }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch (_) { }
    throw new Error(`Lỗi ${res.status}${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  const required = ["crop", "cropConfidence", "cropTopK", "disease", "diseaseConfidence", "diseaseTopK", "isHealthy"];
  const missing = required.filter(k => !(k in data));
  if (missing.length) throw new Error(`Response thiếu field: ${missing.join(", ")}`);
  return data;
}

/* ─────────────────────────────────────────────
   UI COMPONENTS (LIGHT THEME)
───────────────────────────────────────────────*/
const SEVERITY_META = {
  none: { label: "Khỏe mạnh", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  low: { label: "Nhẹ", color: "#65a30d", bg: "#f7fee7", border: "#d9f99d" },
  medium: { label: "Trung bình", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  high: { label: "Nặng", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  critical: { label: "Nguy cấp", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  unknown: { label: "Không rõ", color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
};

const SeverityPill = ({ severity }) => {
  const m = SEVERITY_META[severity] || SEVERITY_META.unknown;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 100,
      background: m.bg, border: `1px solid ${m.border}`, color: m.color, fontSize: 12, fontWeight: 600
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} /> {m.label}
    </span>
  );
};

const ConfidenceBar = ({ label, value, highlight }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(value), 100); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{
          fontSize: 13, color: highlight ? "#0284c7" : "#475569", fontWeight: highlight ? 600 : 400,
          maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        }}>{label}</span>
        <span style={{ fontSize: 12, fontFamily: "monospace", color: highlight ? "#0284c7" : "#64748b", fontWeight: 700 }}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div style={{ background: "#e2e8f0", borderRadius: 6, height: 6, overflow: "hidden" }}>
        <div style={{
          width: `${width}%`, height: "100%", borderRadius: 6,
          background: highlight ? "linear-gradient(90deg, #38bdf8, #0284c7)" : "#cbd5e1",
          transition: "width 0.8s cubic-bezier(.16,1,.3,1)"
        }} />
      </div>
    </div>
  );
};

const PipelineStep = ({ step, active, done, label, icon }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
    <div style={{
      width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
      border: `1.5px solid ${done ? "#38bdf8" : active ? "#0ea5e9" : "#e2e8f0"}`,
      background: done ? "#f0f9ff" : active ? "#e0f2fe" : "#f8fafc", fontSize: 20, transition: "all 0.3s ease",
      boxShadow: active ? "0 4px 12px rgba(14,165,233,0.15)" : "none"
    }}>
      {done ? <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path d="M3 8l4 4 6-7" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg> : icon}
    </div>
    <div>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>BƯỚC {step}</div>
      <div style={{ fontSize: 14, color: done ? "#0284c7" : active ? "#0ea5e9" : "#64748b", fontWeight: 600 }}>{label}</div>
    </div>
  </div>
);

const ScanCard = ({ scan, onClick, isActive }) => {
  const info = scan.result ? getDiseaseInfo(scan.result.disease) : null;
  const sm = info ? (SEVERITY_META[info.severity] || SEVERITY_META.unknown) : null;

  return (
    <div onClick={onClick} style={{
      padding: "10px", borderRadius: 12,
      background: isActive ? "#eff6ff" : "#ffffff", border: `1px solid ${isActive ? "#bfdbfe" : "#e2e8f0"}`,
      cursor: "pointer", marginBottom: 8, transition: "all 0.2s ease", boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.04)" : "none"
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "1px solid #e2e8f0" }}>
          <img src={scan.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {CROP_EMOJI[scan.result?.crop] || "🌿"} {CROP_LABEL[scan.result?.crop] || scan.result?.crop || "—"}
          </div>
          {info && <div style={{ fontSize: 11, marginTop: 2, color: sm?.color || "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {info.icon} {info.name}
          </div>}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{new Date(scan.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────*/
export default function PlantDiseaseApp() {
  const [screen, setScreen] = useState("upload");
  const [preview, setPreview] = useState(null);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [apiInfo, setApiInfo] = useState(null);
  const fileRef = useRef();
  const scanIdRef = useRef(0);

  const handleNewScan = () => {
    setScreen("upload");
    setPreview(null);
    setResult(null);
    setActiveHistoryId(null);
    setError(null);
    setAnalyzeStep(0);
  };

  const testConnection = useCallback(async (url) => {
    setApiStatus("checking"); setApiInfo(null);
    try { const info = await checkHealth(url); setApiStatus("ok"); setApiInfo(info); }
    catch (e) { setApiStatus("error"); setApiInfo({ error: e.message }); }
  }, []);

  useEffect(() => { testConnection(DEFAULT_API_URL); }, []);

  const processImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    if (apiStatus !== "ok") return setError("Backend chưa kết nối. Vào ⚙ Cài đặt để kiểm tra.");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl); setScreen("analyzing"); setAnalyzeStep(1); setResult(null);
      const id = ++scanIdRef.current;
      setHistory(h => [{ id, preview: dataUrl, time: Date.now(), result: null }, ...h.slice(0, 19)]);
      setActiveHistoryId(id);
      try {
        await new Promise(r => setTimeout(r, 600)); setAnalyzeStep(2);
        const res = await predict(dataUrl, apiUrl);
        setAnalyzeStep(3); await new Promise(r => setTimeout(r, 300));
        setResult(res); setScreen("result");
        setHistory(h => h.map(s => s.id === id ? { ...s, result: res } : s));
      } catch (err) {
        setError(err.message); setScreen("upload"); setAnalyzeStep(0);
        setHistory(h => h.filter(s => s.id !== id));
      }
    };
    reader.readAsDataURL(file);
  }, [apiUrl, apiStatus]);

  const statusColor = apiStatus === "ok" ? "#10b981" : apiStatus === "checking" ? "#f59e0b" : apiStatus === "error" ? "#ef4444" : "#94a3b8";

  /* ─── SCREENS ─── */
  const UploadScreen = () => (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ display: "inline-flex", padding: "6px 16px", borderRadius: 100, background: "#e0f2fe", color: "#0284c7", fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 20 }}>
          AI CHẨN ĐOÁN BỆNH CÂY TRỒNG
        </div>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 48px)", color: "#0f172a", fontWeight: 800, margin: "0 0 16px", lineHeight: 1.1 }}>
          PhytoAI <span style={{ color: "#0ea5e9" }}>Intelligence</span>
        </h1>
        <p style={{ color: "#64748b", fontSize: 15 }}>Pipeline AI 2 tầng: nhận diện cây trồng → chẩn đoán bệnh chuyên sâu</p>
      </div>

      {apiStatus !== "ok" && (
        <div style={{ padding: "14px 20px", borderRadius: 12, background: apiStatus === "error" ? "#fef2f2" : "#fffbeb", border: `1px solid ${apiStatus === "error" ? "#fecaca" : "#fde68a"}`, marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, color: apiStatus === "error" ? "#ef4444" : "#d97706" }}>
            {apiStatus === "checking" ? "⏳ Đang kết nối backend..." : "⚠ Không kết nối được backend"}
          </span>
          {apiStatus === "error" && <button onClick={() => setShowSettings(true)} style={{ background: "#fff", border: "1px solid #fca5a5", color: "#ef4444", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Cài đặt</button>}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processImage(f); }}
        onClick={() => apiStatus === "ok" && fileRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? "#38bdf8" : apiStatus === "ok" ? "#bae6fd" : "#e2e8f0"}`, borderRadius: 24, padding: "56px 32px",
          display: "flex", flexDirection: "column", alignItems: "center", cursor: apiStatus === "ok" ? "pointer" : "not-allowed",
          background: dragOver ? "#f0f9ff" : "#ffffff", transition: "all 0.2s ease", opacity: apiStatus === "ok" ? 1 : 0.6,
          boxShadow: "0 10px 30px rgba(0,0,0,0.02)"
        }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🌿</div>
        <div style={{ fontSize: 18, color: "#0f172a", fontWeight: 700, marginBottom: 10 }}>{apiStatus === "ok" ? "Kéo & thả ảnh vào đây" : "Chờ kết nối backend..."}</div>
        {apiStatus === "ok" && (
          <>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>hoặc nhấn để chọn ảnh từ máy</div>
            <div style={{ padding: "10px 28px", borderRadius: 100, background: "#0ea5e9", color: "#fff", fontWeight: 600, fontSize: 14, boxShadow: "0 4px 14px rgba(14,165,233,0.3)" }}>CHỌN ẢNH</div>
          </>
        )}
      </div>

      {error && <div style={{ marginTop: 20, padding: "14px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", fontSize: 14 }}>⚠ {error}</div>}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => e.target.files[0] && processImage(e.target.files[0])} />
    </div>
  );

  const AnalyzingScreen = () => (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 32, marginBottom: 32, alignItems: "center" }}>
        <div style={{ width: 200, height: 200, borderRadius: 24, overflow: "hidden", border: "2px solid #e0f2fe", position: "relative", boxShadow: "0 12px 32px rgba(14,165,233,0.15)" }}>
          <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "#0ea5e9", boxShadow: "0 0 12px #0ea5e9", animation: "scanline 1.5s linear infinite" }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <PipelineStep step={1} active={analyzeStep === 1} done={analyzeStep > 1} label="Nhận diện cây trồng" icon="🌱" />
          <PipelineStep step={2} active={analyzeStep === 2} done={analyzeStep > 2} label="Chẩn đoán bệnh" icon="🔬" />
        </div>
      </div>
      <div style={{ padding: "16px 24px", borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#0ea5e9", animation: "pulse 1s infinite" }} />
        <span style={{ fontSize: 15, color: "#475569", fontWeight: 500 }}>
          {analyzeStep === 1 ? "Đang nhận diện loài cây..." : analyzeStep === 2 ? "Đang phân tích bệnh lý..." : "Đang tổng hợp kết quả..."}
        </span>
      </div>
    </div>
  );

  const ResultScreen = () => {
    if (!result) return null;
    const { crop, cropConfidence, cropTopK, disease, diseaseConfidence, diseaseTopK, isHealthy } = result;
    const info = getDiseaseInfo(disease);
    const sm = SEVERITY_META[info.severity] || SEVERITY_META.unknown;

    return (
      <div style={{ width: "100%", maxWidth: 780, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <h2 style={{ fontSize: 28, color: "#0f172a", margin: 0, fontWeight: 800 }}>{CROP_EMOJI[crop]} {CROP_LABEL[crop] || crop}</h2>
              <SeverityPill severity={info.severity} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: isHealthy ? "#059669" : sm.color }}>{info.name}</div>
          </div>
          <button onClick={() => { setScreen("upload"); setError(null); }} style={{ padding: "10px 24px", borderRadius: 100, background: "#fff", border: "1px solid #cbd5e1", color: "#475569", cursor: "pointer", fontWeight: 600, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>+ Quét ảnh mới</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ borderRadius: 20, overflow: "hidden", border: `1px solid ${isHealthy ? "#a7f3d0" : "#e2e8f0"}`, boxShadow: "0 4px 20px rgba(0,0,0,0.05)" }}>
            <img src={preview} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
            <div style={{ padding: "12px", background: isHealthy ? "#ecfdf5" : sm.bg, textAlign: "center", fontSize: 12, fontWeight: 700, color: isHealthy ? "#059669" : sm.color }}>
              {isHealthy ? "KHỎE MẠNH" : "PHÁT HIỆN BỆNH"}
            </div>
          </div>
          <div style={{ padding: 24, borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 4px 20px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>NGUYÊN NHÂN</div>
              <div style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.5 }}>{info.cause}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>TRIỆU CHỨNG</div>
              <p style={{ fontSize: 15, color: "#475569", lineHeight: 1.6, margin: 0 }}>{info.short}</p>
            </div>
            <div style={{ display: "flex", gap: 32, marginTop: "auto", paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>ĐỘ TIN CẬY (CROP)</div>
                <div style={{ fontSize: 24, color: "#0ea5e9", fontWeight: 800 }}>{cropConfidence.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>ĐỘ TIN CẬY (DISEASE)</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: isHealthy ? "#059669" : sm.color }}>{diseaseConfidence.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        </div>

        {!isHealthy && (
          <div style={{ marginBottom: 24, padding: "20px 24px", borderRadius: 20, background: sm.bg, border: `1px solid ${sm.border}` }}>
            <div style={{ fontSize: 12, color: sm.color, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>💊 HƯỚNG DẪN XỬ LÝ</div>
            <p style={{ fontSize: 15, color: "#1e293b", lineHeight: 1.7, margin: 0 }}>{info.treatment}</p>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={{ padding: "20px", borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>THỐNG KÊ MODEL CROP</div>
            {cropTopK.map(({ name, confidence }) => <ConfidenceBar key={name} label={`${CROP_EMOJI[name] || ""} ${CROP_LABEL[name] || name}`} value={confidence} highlight={name === crop} />)}
          </div>
          <div style={{ padding: "20px", borderRadius: 20, background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 10px rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>THỐNG KÊ MODEL DISEASE</div>
            {diseaseTopK.map(({ name, confidence }) => <ConfidenceBar key={name} label={parseFolderName(name)} value={confidence} highlight={name === disease} />)}
          </div>
        </div>
      </div>
    );
  };

  const SettingsModal = () => {
    const [localUrl, setLocalUrl] = useState(apiUrl);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowSettings(false)}>
        <div onClick={e => e.stopPropagation()} style={{ width: 480, padding: 32, borderRadius: 24, background: "#ffffff", boxShadow: "0 20px 40px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: 20, color: "#0f172a", fontWeight: 800, marginBottom: 8 }}>⚙ Cấu hình Kết nối</div>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>Địa chỉ máy chủ AI phân tích.</p>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <input value={localUrl} onChange={e => setLocalUrl(e.target.value)} placeholder="http://localhost:8000" style={{ flex: 1, padding: "12px 16px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 14, outline: "none" }} />
            <button onClick={() => { setApiUrl(localUrl); testConnection(localUrl); }} style={{ padding: "0 20px", borderRadius: 12, background: "#e0f2fe", color: "#0284c7", border: "none", fontWeight: 600, cursor: "pointer" }}>TEST</button>
          </div>
          <button onClick={() => { setApiUrl(localUrl); setShowSettings(false); }} style={{ width: "100%", padding: "14px", borderRadius: 12, background: "#0ea5e9", color: "#ffffff", border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>LƯU & ĐÓNG</button>
        </div>
      </div>
    );
  };

  /* ─── RENDER ─── */
  return (
    <div style={{ minHeight: "100vh", background: "#f4f7f9", fontFamily: "'Inter', system-ui, sans-serif", display: "flex", flexDirection: "column", color: "#1e293b" }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes scanline { 0%{top:0%} 100%{top:100%} }
        @keyframes fadeup { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "0 28px", height: 64, background: "#ffffff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>🌿</span>
          <span style={{ fontSize: 20, color: "#0f172a", fontWeight: 800 }}>Phyto<span style={{ color: "#0ea5e9" }}>AI</span></span>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, animation: apiStatus === "checking" ? "pulse 1s infinite" : "none" }} />
            <span style={{ fontSize: 12, color: statusColor, fontWeight: 600 }}>{apiStatus === "ok" ? "ĐÃ KẾT NỐI" : apiStatus === "checking" ? "ĐANG KẾT NỐI" : "MẤT KẾT NỐI"}</span>
          </div>
          <button onClick={() => setShowSettings(true)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", color: "#475569", padding: "8px 16px", borderRadius: 100, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>⚙ CÀI ĐẶT</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", maxHeight: "calc(100vh - 64px)" }}>
        {/* SIDEBAR */}
        <div style={{ width: 260, background: "#ffffff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "20px 20px 12px" }}>
            {/* NÚT THÊM ẢNH MỚI LUÔN HIỂN THỊ */}
            <button
              onClick={handleNewScan}
              style={{
                width: "100%", padding: "12px", background: "#0ea5e9", color: "#ffffff",
                border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px",
                cursor: "pointer", marginBottom: "20px",
                boxShadow: "0 4px 12px rgba(14,165,233,0.25)", transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => e.target.style.background = "#0284c7"}
              onMouseOut={(e) => e.target.style.background = "#0ea5e9"}
            >
              + QUÉT ẢNH MỚI
            </button>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>LỊCH SỬ QUÉT</div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px" }}>
            {history.length === 0
              ? <div style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", marginTop: 40 }}>Chưa có lịch sử</div>
              : history.map(s => (
                <ScanCard
                  key={s.id}
                  scan={s}
                  isActive={s.id === activeHistoryId}
                  onClick={() => {
                    setActiveHistoryId(s.id);
                    setPreview(s.preview);
                    if (s.result) {
                      setResult(s.result);
                      setScreen("result");
                    }
                  }}
                />
              ))
            }
          </div>
          <div style={{ padding: "20px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>KIẾN TRÚC HỆ THỐNG</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{ step: "1", title: "Crop Classifier", sub: "MobileNetV2" }, { step: "2", title: "Disease Experts", sub: "5 Models chuyên sâu" }].map(i => (
                <div key={i.step} style={{ padding: "10px 12px", borderRadius: 10, background: "#ffffff", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 600 }}>Bước {i.step}: {i.title}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{i.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 40, animation: "fadeup 0.3s ease" }}>
          {screen === "upload" && <UploadScreen />}
          {screen === "analyzing" && <AnalyzingScreen />}
          {screen === "result" && <ResultScreen />}
        </div>
      </div>
      {showSettings && <SettingsModal />}
    </div>
  );
}