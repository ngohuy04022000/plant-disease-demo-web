import { useState, useRef, useCallback, useEffect } from "react";

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────────*/
const DEFAULT_API_URL = "http://localhost:8000";

const CROP_EMOJI = { Potato: "🥔", Rice: "🌾", Tomato: "🍅", Wheat: "🌿", sugarcane: "🎋" };
const CROP_LABEL = { Potato: "Khoai tây", Rice: "Lúa", Tomato: "Cà chua", Wheat: "Lúa mì", sugarcane: "Mía" };

const MODEL_META = {
  mobilenet: {
    label: "MobileNetV2",
    sublabel: "TensorFlow / Keras",
    badge: "CNN",
    badgeColor: "#7c3aed",
    badgeBg: "#ede9fe",
    desc: "Nhanh, nhẹ — phù hợp thiết bị edge",
    input: "256 × 256",
    framework: "TensorFlow",
  },
  vit: {
    label: "ViT-B/16",
    sublabel: "PyTorch + timm",
    badge: "Transformer",
    badgeColor: "#0369a1",
    badgeBg: "#e0f2fe",
    desc: "Độ chính xác cao — kiến trúc Attention",
    input: "224 × 224",
    framework: "PyTorch",
  },
};

/* ─────────────────────────────────────────────
   DISEASE DATA
───────────────────────────────────────────────*/
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
    short: "Chưa có thông tin chi tiết trong cơ sở dữ liệu.",
    treatment: "Liên hệ cán bộ khuyến nông địa phương để được tư vấn cụ thể.",
  };
}

/* ─────────────────────────────────────────────
   API HELPERS
───────────────────────────────────────────────*/
async function checkHealth(apiUrl) {
  const res = await fetch(`${apiUrl}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error("Backend status is not 'ok'");
  return data;
}

async function predict(imageDataUrl, apiUrl, model) {
  const base64 = imageDataUrl.split(",").pop();
  const res = await fetch(`${apiUrl}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, model }),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch (_) { }
    throw new Error(`Lỗi ${res.status}${detail ? ": " + detail : ""}`);
  }
  const data = await res.json();
  const required = ["model_used", "crop", "crop_confidence", "crop_top_k", "disease", "disease_confidence", "disease_top_k", "is_healthy"];
  const missing = required.filter(k => !(k in data));
  if (missing.length) throw new Error(`Response thiếu field: ${missing.join(", ")}`);
  return data;
}

/* ─────────────────────────────────────────────
   UI COMPONENTS
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
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color }} />{m.label}
    </span>
  );
};

const ModelBadge = ({ model }) => {
  const m = MODEL_META[model];
  if (!m) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 100,
      background: m.badgeBg, color: m.badgeColor, fontSize: 11, fontWeight: 700, letterSpacing: 0.3
    }}>
      {m.badge}
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
          background: highlight ? "linear-gradient(90deg,#38bdf8,#0284c7)" : "#cbd5e1",
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
  const meta = scan.result?.model_used ? MODEL_META[scan.result.model_used] : null;
  return (
    <div onClick={onClick} style={{
      padding: "10px", borderRadius: 12, marginBottom: 8, cursor: "pointer",
      background: isActive ? "#eff6ff" : "#ffffff", border: `1px solid ${isActive ? "#bfdbfe" : "#e2e8f0"}`,
      transition: "all 0.2s ease", boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.04)" : "none"
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              {new Date(scan.time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
            {meta && <span style={{
              fontSize: 10, color: meta.badgeColor, background: meta.badgeBg,
              padding: "1px 6px", borderRadius: 100, fontWeight: 600
            }}>{meta.badge}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Model Selector Toggle ─── */
const ModelSelector = ({ selected, onChange, compact = false }) => (
  <div style={{
    display: "flex", gap: compact ? 4 : 8, background: "#f1f5f9", borderRadius: compact ? 10 : 14,
    padding: compact ? 3 : 4, alignItems: "center"
  }}>
    {["mobilenet", "vit"].map(key => {
      const m = MODEL_META[key];
      const act = selected === key;
      return (
        <button key={key} onClick={() => onChange(key)} style={{
          padding: compact ? "5px 12px" : "8px 18px",
          borderRadius: compact ? 7 : 10,
          border: "none",
          background: act ? "#ffffff" : "transparent",
          color: act ? m.badgeColor : "#64748b",
          fontWeight: act ? 700 : 500,
          fontSize: compact ? 12 : 13,
          cursor: "pointer",
          transition: "all 0.18s ease",
          boxShadow: act ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          whiteSpace: "nowrap",
        }}>
          {m.label}
        </button>
      );
    })}
  </div>
);

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
  const [selectedModel, setSelectedModel] = useState("mobilenet");

  const fileRef = useRef();
  const scanIdRef = useRef(0);

  const handleNewScan = () => {
    setScreen("upload"); setPreview(null); setResult(null);
    setActiveHistoryId(null); setError(null); setAnalyzeStep(0);
  };

  const testConnection = useCallback(async (url) => {
    setApiStatus("checking"); setApiInfo(null);
    try { const info = await checkHealth(url); setApiStatus("ok"); setApiInfo(info); }
    catch (e) { setApiStatus("error"); setApiInfo({ error: e.message }); }
  }, []);

  useEffect(() => { testConnection(DEFAULT_API_URL); }, []);

  const selectedModelRef = useRef(selectedModel);

  useEffect(() => {
    // Chỉ trigger dự đoán lại nếu mô hình thay đổi, đang ở màn hình result/analyzing 
    // và có ảnh preview
    if (selectedModel !== selectedModelRef.current) {
      selectedModelRef.current = selectedModel;

      if (preview && (screen === "result" || screen === "analyzing")) {
        // Tạo một object File giả lập hoặc thay đổi hàm processImage để nhận dataUrl
        // Cách nhanh nhất: Tách logic gọi API ra khỏi việc đọc File
        rePredictDataUrl(preview, selectedModel);
      }
    }
  }, [selectedModel, preview, screen]);

  // Hàm helper để gọi lại API với ảnh hiện tại (đã chuyển thành base64/dataUrl)
  const rePredictDataUrl = async (dataUrl, modelName) => {
    setError(null);
    setScreen("analyzing"); setAnalyzeStep(1); setResult(null);
    const id = activeHistoryId || ++scanIdRef.current; // Dùng lại ID cũ nếu đang xem

    try {
      setAnalyzeStep(2);
      const res = await predict(dataUrl, apiUrl, modelName);
      setAnalyzeStep(3);
      setTimeout(() => {
        setResult(res); setScreen("result");
        setHistory(h => h.map(s => s.id === id ? { ...s, result: res } : s));
      }, 300);
    } catch (err) {
      setError(err.message); setScreen("upload"); setAnalyzeStep(0);
    }
  };

  const processImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setError(null);
    if (apiStatus !== "ok") return setError("Backend chưa kết nối. Vào Cài đặt để kiểm tra.");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      setPreview(dataUrl); setScreen("analyzing"); setAnalyzeStep(1); setResult(null);
      const id = ++scanIdRef.current;
      setHistory(h => [{ id, preview: dataUrl, time: Date.now(), result: null }, ...h.slice(0, 19)]);
      setActiveHistoryId(id);
      try {
        await new Promise(r => setTimeout(r, 600)); setAnalyzeStep(2);
        const res = await predict(dataUrl, apiUrl, selectedModel);
        setAnalyzeStep(3); await new Promise(r => setTimeout(r, 300));
        setResult(res); setScreen("result");
        setHistory(h => h.map(s => s.id === id ? { ...s, result: res } : s));
      } catch (err) {
        setError(err.message); setScreen("upload"); setAnalyzeStep(0);
        setHistory(h => h.filter(s => s.id !== id));
      }
    };
    reader.readAsDataURL(file);
  }, [apiUrl, apiStatus, selectedModel]);

  const statusColor = apiStatus === "ok" ? "#10b981" : apiStatus === "checking" ? "#f59e0b" : apiStatus === "error" ? "#ef4444" : "#94a3b8";
  const activeModelMeta = MODEL_META[selectedModel];

  /* ─── SCREENS ─── */
  const UploadScreen = () => (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          display: "inline-flex", padding: "6px 16px", borderRadius: 100,
          background: "#e0f2fe", color: "#0284c7", fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 20
        }}>
          AI CHẨN ĐOÁN BỆNH CÂY TRỒNG
        </div>
        <h1 style={{ fontSize: "clamp(28px,5vw,44px)", color: "#0f172a", fontWeight: 800, margin: "0 0 12px", lineHeight: 1.1 }}>
          PhytoAI <span style={{ color: "#0ea5e9" }}>Intelligence</span>
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, marginBottom: 0 }}>
          Pipeline AI 2 tầng: nhận diện cây trồng → chẩn đoán bệnh chuyên sâu
        </p>
      </div>

      {/* Model selector */}
      <div style={{
        marginBottom: 28, padding: "20px 24px", borderRadius: 20,
        background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
      }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>
          CHỌN MÔ HÌNH SUY LUẬN
        </div>
        <ModelSelector selected={selectedModel} onChange={setSelectedModel} />
        <div style={{
          marginTop: 16, padding: "14px 16px", borderRadius: 12,
          background: activeModelMeta.badgeBg, border: `1px solid ${activeModelMeta.badgeColor}22`
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <ModelBadge model={selectedModel} />
            <span style={{ fontSize: 14, fontWeight: 700, color: activeModelMeta.badgeColor }}>
              {activeModelMeta.label}
            </span>
            <span style={{ fontSize: 12, color: "#64748b" }}>— {activeModelMeta.sublabel}</span>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5 }}>FRAMEWORK</div>
              <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>{activeModelMeta.framework}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5 }}>INPUT SIZE</div>
              <div style={{ fontSize: 12, color: "#1e293b", fontWeight: 600, marginTop: 2 }}>{activeModelMeta.input}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5 }}>MÔ TẢ</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{activeModelMeta.desc}</div>
            </div>
          </div>
        </div>
      </div>

      {apiStatus !== "ok" && (
        <div style={{
          padding: "14px 20px", borderRadius: 12, marginBottom: 24, display: "flex",
          justifyContent: "space-between", alignItems: "center",
          background: apiStatus === "error" ? "#fef2f2" : "#fffbeb",
          border: `1px solid ${apiStatus === "error" ? "#fecaca" : "#fde68a"}`
        }}>
          <span style={{ fontSize: 14, color: apiStatus === "error" ? "#ef4444" : "#d97706" }}>
            {apiStatus === "checking" ? "Đang kết nối backend..." : "Không kết nối được backend"}
          </span>
          {apiStatus === "error" && (
            <button onClick={() => setShowSettings(true)} style={{
              background: "#fff",
              border: "1px solid #fca5a5", color: "#ef4444", padding: "6px 14px", borderRadius: 8,
              cursor: "pointer", fontWeight: 600
            }}>Cài đặt</button>
          )}
        </div>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processImage(f); }}
        onClick={() => apiStatus === "ok" && fileRef.current.click()}
        style={{
          border: `2px dashed ${dragOver ? "#38bdf8" : apiStatus === "ok" ? "#bae6fd" : "#e2e8f0"}`,
          borderRadius: 24, padding: "48px 32px", display: "flex", flexDirection: "column",
          alignItems: "center", cursor: apiStatus === "ok" ? "pointer" : "not-allowed",
          background: dragOver ? "#f0f9ff" : "#ffffff", transition: "all 0.2s ease",
          opacity: apiStatus === "ok" ? 1 : 0.6, boxShadow: "0 6px 24px rgba(0,0,0,0.03)"
        }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🌿</div>
        <div style={{ fontSize: 17, color: "#0f172a", fontWeight: 700, marginBottom: 8 }}>
          {apiStatus === "ok" ? "Kéo & thả ảnh vào đây" : "Chờ kết nối backend..."}
        </div>
        {apiStatus === "ok" && <>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>hoặc nhấn để chọn ảnh từ máy</div>
          <div style={{
            padding: "10px 28px", borderRadius: 100, background: "#0ea5e9", color: "#fff",
            fontWeight: 600, fontSize: 14, boxShadow: "0 4px 14px rgba(14,165,233,0.3)"
          }}>CHỌN ẢNH</div>
        </>}
      </div>

      {error && <div style={{
        marginTop: 20, padding: "14px", borderRadius: 12,
        background: "#fef2f2", border: "1px solid #fecaca", color: "#ef4444", fontSize: 14
      }}>
        {error}
      </div>}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={e => e.target.files[0] && processImage(e.target.files[0])} />
    </div>
  );

  const AnalyzingScreen = () => (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 32, marginBottom: 32, alignItems: "center" }}>
        <div style={{
          width: 200, height: 200, borderRadius: 24, overflow: "hidden",
          border: "2px solid #e0f2fe", position: "relative", boxShadow: "0 12px 32px rgba(14,165,233,0.15)"
        }}>
          <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", left: 0, right: 0, height: 3, background: "#0ea5e9",
            boxShadow: "0 0 12px #0ea5e9", animation: "scanline 1.5s linear infinite"
          }} />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <PipelineStep step={1} active={analyzeStep === 1} done={analyzeStep > 1} label="Nhận diện cây trồng" icon="🌱" />
          <PipelineStep step={2} active={analyzeStep === 2} done={analyzeStep > 2} label="Chẩn đoán bệnh" icon="🔬" />
        </div>
      </div>
      <div style={{
        padding: "14px 20px", borderRadius: 14, background: activeModelMeta.badgeBg,
        border: `1px solid ${activeModelMeta.badgeColor}33`, display: "flex", alignItems: "center", gap: 12, marginBottom: 12
      }}>
        <ModelBadge model={selectedModel} />
        <span style={{ fontSize: 13, color: activeModelMeta.badgeColor, fontWeight: 600 }}>
          {activeModelMeta.label} — {activeModelMeta.sublabel}
        </span>
      </div>
      <div style={{
        padding: "14px 20px", borderRadius: 14, background: "#f8fafc",
        border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 14
      }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#0ea5e9", animation: "pulse 1s infinite", flexShrink: 0 }} />
        <span style={{ fontSize: 15, color: "#475569", fontWeight: 500 }}>
          {analyzeStep === 1 ? "Đang nhận diện loài cây..." : analyzeStep === 2 ? "Đang phân tích bệnh lý..." : "Đang tổng hợp kết quả..."}
        </span>
      </div>
    </div>
  );

  const ResultScreen = () => {
    if (!result) return null;
    const { model_used, crop, crop_confidence, crop_top_k, disease, disease_confidence, disease_top_k, is_healthy } = result;
    const info = getDiseaseInfo(disease);
    const sm = SEVERITY_META[info.severity] || SEVERITY_META.unknown;
    const mMeta = MODEL_META[model_used] || MODEL_META.mobilenet;

    return (
      <div style={{ width: "100%", maxWidth: 800, margin: "0 auto" }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 26, color: "#0f172a", margin: 0, fontWeight: 800 }}>
                {CROP_EMOJI[crop]} {CROP_LABEL[crop] || crop}
              </h2>
              <SeverityPill severity={info.severity} />
              <ModelBadge model={model_used} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: is_healthy ? "#059669" : sm.color }}>{info.name}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
              {mMeta.label} · {mMeta.sublabel}
            </div>
          </div>
          <button onClick={() => { setScreen("upload"); setError(null); }} style={{
            padding: "10px 22px", borderRadius: 100, background: "#fff", border: "1px solid #cbd5e1",
            color: "#475569", cursor: "pointer", fontWeight: 600, fontSize: 13,
            boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
          }}>+ Quét ảnh mới</button>
        </div>

        {/* Image + diagnosis card */}
        <div style={{ display: "grid", gridTemplateColumns: "210px 1fr", gap: 20, marginBottom: 20 }}>
          <div style={{
            borderRadius: 18, overflow: "hidden",
            border: `1px solid ${is_healthy ? "#a7f3d0" : "#e2e8f0"}`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.05)"
          }}>
            <img src={preview} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }} />
            <div style={{
              padding: "10px", background: is_healthy ? "#ecfdf5" : sm.bg,
              textAlign: "center", fontSize: 11, fontWeight: 700, color: is_healthy ? "#059669" : sm.color
            }}>
              {is_healthy ? "KHỎE MẠNH" : "PHÁT HIỆN BỆNH"}
            </div>
          </div>
          <div style={{
            padding: 22, borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0",
            boxShadow: "0 4px 20px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", gap: 14
          }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>NGUYÊN NHÂN</div>
              <div style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.5 }}>{info.cause}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>TRIỆU CHỨNG</div>
              <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.6, margin: 0 }}>{info.short}</p>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: "auto", paddingTop: 14, borderTop: "1px solid #f1f5f9", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>CROP CONFIDENCE</div>
                <div style={{ fontSize: 22, color: "#0ea5e9", fontWeight: 800 }}>{crop_confidence.toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>DISEASE CONFIDENCE</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: is_healthy ? "#059669" : sm.color }}>{disease_confidence.toFixed(1)}%</div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{
                  padding: "6px 12px", borderRadius: 10, background: mMeta.badgeBg, fontSize: 11,
                  color: mMeta.badgeColor, fontWeight: 700
                }}>{mMeta.label}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Treatment */}
        {!is_healthy && (
          <div style={{ marginBottom: 20, padding: "18px 22px", borderRadius: 18, background: sm.bg, border: `1px solid ${sm.border}` }}>
            <div style={{ fontSize: 11, color: sm.color, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>HƯỚNG DẪN XỬ LÝ</div>
            <p style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.7, margin: 0 }}>{info.treatment}</p>
          </div>
        )}

        {/* Confidence charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: "18px", borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>
              PHÂN PHỐI XÁC SUẤT — CROP
            </div>
            {crop_top_k.map(({ name, confidence }) => (
              <ConfidenceBar key={name} label={`${CROP_EMOJI[name] || ""} ${CROP_LABEL[name] || name}`}
                value={confidence} highlight={name === crop} />
            ))}
          </div>
          <div style={{ padding: "18px", borderRadius: 18, background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>
              PHÂN PHỐI XÁC SUẤT — DISEASE
            </div>
            {disease_top_k.map(({ name, confidence }) => (
              <ConfidenceBar key={name} label={getDiseaseInfo(name).name} value={confidence} highlight={name === disease} />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const SettingsModal = () => {
    const [localUrl, setLocalUrl] = useState(apiUrl);
    const [localModel, setLocalModel] = useState(selectedModel);
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
        backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
      }}
        onClick={() => setShowSettings(false)}>
        <div onClick={e => e.stopPropagation()} style={{
          width: 500, padding: 32, borderRadius: 24,
          background: "#ffffff", boxShadow: "0 20px 40px rgba(0,0,0,0.12)"
        }}>
          <div style={{ fontSize: 18, color: "#0f172a", fontWeight: 800, marginBottom: 6 }}>Cấu hình Kết nối</div>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Địa chỉ máy chủ API và mô hình mặc định.</p>

          {/* API URL */}
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
            ĐỊA CHỈ API SERVER
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <input value={localUrl} onChange={e => setLocalUrl(e.target.value)}
              placeholder="http://localhost:8000"
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 12, background: "#f8fafc",
                border: "1px solid #e2e8f0", color: "#0f172a", fontSize: 14, outline: "none"
              }} />
            <button onClick={() => testConnection(localUrl)} style={{
              padding: "0 18px",
              borderRadius: 12, background: "#e0f2fe", color: "#0284c7", border: "none",
              fontWeight: 600, cursor: "pointer", fontSize: 13
            }}>TEST</button>
          </div>

          {/* Connection status */}
          {apiInfo && (
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20, fontSize: 12,
              background: apiStatus === "ok" ? "#ecfdf5" : "#fef2f2",
              color: apiStatus === "ok" ? "#059669" : "#ef4444",
              border: `1px solid ${apiStatus === "ok" ? "#a7f3d0" : "#fecaca"}`
            }}>
              {apiStatus === "ok"
                ? `Đã kết nối · ${apiInfo.crop_classes?.length || 0} crops · MobileNetV2 + ViT`
                : `Lỗi: ${apiInfo.error}`}
            </div>
          )}

          {/* Model selector */}
          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
            MÔ HÌNH MẶC ĐỊNH
          </div>
          <ModelSelector selected={localModel} onChange={setLocalModel} />
          <div style={{
            marginTop: 12, marginBottom: 20, padding: "12px 14px", borderRadius: 12,
            background: MODEL_META[localModel].badgeBg,
            border: `1px solid ${MODEL_META[localModel].badgeColor}22`
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: MODEL_META[localModel].badgeColor, marginBottom: 3 }}>
              {MODEL_META[localModel].label} — {MODEL_META[localModel].sublabel}
            </div>
            <div style={{ fontSize: 12, color: "#475569" }}>
              Input: {MODEL_META[localModel].input} · {MODEL_META[localModel].desc}
            </div>
          </div>

          <button onClick={() => { setApiUrl(localUrl); setSelectedModel(localModel); setShowSettings(false); }}
            style={{
              width: "100%", padding: "13px", borderRadius: 12, background: "#0ea5e9",
              color: "#ffffff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer"
            }}>
            LƯU VÀ ĐÓNG
          </button>
        </div>
      </div>
    );
  };

  /* ─── LAYOUT ─── */
  return (
    <div style={{
      minHeight: "100vh", background: "#f4f7f9", fontFamily: "'Inter',system-ui,sans-serif",
      display: "flex", flexDirection: "column", color: "#1e293b"
    }}>
      <style>{`
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.5} }
        @keyframes scanline { 0%{top:0%} 100%{top:100%} }
        @keyframes fadeup   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* HEADER */}
      <div style={{
        padding: "0 24px", height: 60, background: "#ffffff",
        borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🌿</span>
          <span style={{ fontSize: 18, color: "#0f172a", fontWeight: 800 }}>
            Phyto<span style={{ color: "#0ea5e9" }}>AI</span>
          </span>
        </div>

        {/* Centre: compact model selector */}
        <ModelSelector selected={selectedModel} onChange={setSelectedModel} compact />

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: statusColor,
              animation: apiStatus === "checking" ? "pulse 1s infinite" : "none"
            }} />
            <span style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>
              {apiStatus === "ok" ? "ĐÃ KẾT NỐI" : apiStatus === "checking" ? "ĐANG KẾT NỐI" : "MẤT KẾT NỐI"}
            </span>
          </div>
          <button onClick={() => setShowSettings(true)} style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0", color: "#475569", padding: "7px 14px",
            borderRadius: 100, cursor: "pointer", fontSize: 12, fontWeight: 600
          }}>CÀI ĐẶT</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", maxHeight: "calc(100vh - 60px)" }}>
        {/* SIDEBAR */}
        <div style={{
          width: 252, background: "#ffffff", borderRight: "1px solid #e2e8f0",
          display: "flex", flexDirection: "column", flexShrink: 0
        }}>
          <div style={{ padding: "16px 16px 10px" }}>
            <button onClick={handleNewScan} style={{
              width: "100%", padding: "11px",
              background: "#0ea5e9", color: "#ffffff", border: "none", borderRadius: "12px",
              fontWeight: 700, fontSize: "13px", cursor: "pointer", marginBottom: "16px",
              boxShadow: "0 4px 12px rgba(14,165,233,0.25)"
            }}>
              + QUÉT ẢNH MỚI
            </button>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>LỊCH SỬ QUÉT</div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 10px" }}>
            {history.length === 0
              ? <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 36 }}>Chưa có lịch sử</div>
              : history.map(s => (
                <ScanCard key={s.id} scan={s} isActive={s.id === activeHistoryId}
                  onClick={() => {
                    setActiveHistoryId(s.id); setPreview(s.preview);
                    if (s.result) { setResult(s.result); setScreen("result"); }
                  }} />
              ))}
          </div>

          {/* Architecture info */}
          <div style={{ padding: "16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
              MÔ HÌNH ĐANG SỬ DỤNG
            </div>
            <div style={{
              padding: "12px", borderRadius: 12, background: "#ffffff",
              border: `1px solid ${activeModelMeta.badgeColor}33`
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <ModelBadge model={selectedModel} />
                <span style={{ fontSize: 12, fontWeight: 700, color: activeModelMeta.badgeColor }}>
                  {activeModelMeta.label}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{activeModelMeta.sublabel}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Input {activeModelMeta.input}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {[{ step: "1", title: "Crop Classifier" }, { step: "2", title: "Disease Experts", sub: "5 Models" }].map(i => (
                <div key={i.step} style={{
                  padding: "8px 10px", borderRadius: 10, background: "#ffffff",
                  border: "1px solid #e2e8f0"
                }}>
                  <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 600 }}>Bước {i.step}: {i.title}</div>
                  {i.sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{i.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{
          flex: 1, overflow: "auto", display: "flex", alignItems: "center",
          justifyContent: "center", padding: 32, animation: "fadeup 0.3s ease"
        }}>
          {screen === "upload" && <UploadScreen />}
          {screen === "analyzing" && <AnalyzingScreen />}
          {screen === "result" && <ResultScreen />}
        </div>
      </div>

      {showSettings && <SettingsModal />}
    </div>
  );
}