# Battery Lab

電池容量、發熱量、空調冷卻能力與放電曲線估算工具。

網站：https://pmebruce.github.io/battery-lab/

在 iPhone 上，請使用 Safari 開啟網站，點選分享 → 加入主畫面。桌面圖示使用 `apple-touch-icon.png`。

計算結果為初步工程估算，應以實測電芯資料與系統測試驗證。

## PyBaMM 電池模型與 CFD 熱源

首頁連至 `pybamm.html`。8 組真實 PyBaMM 26.10.1.0 求解：Chen2020、Marquis2019 的 SPMe 0.5/1/2 C 與 SPM 1 C。環境及初溫 25°C、h=10 W/(m²·K)、初始 SoC=100%，lumped 熱模型，放電正電流，可因截止電壓提前終止。每組 121 個取樣點，平均熱與總熱量採梯形積分，峰值為取樣峰值。

瀏覽器查看預先求解的範例，支援兩情境比較、熱分量、電壓、平均溫度、CFD CSV 與 JSON 匯入。自訂條件可下載含設定的 Python 求解腳本；電腦需安裝 `pybamm==26.10.1.0`，求解後將 JSON 匯回網站。未在瀏覽器執行 Python 求解器。

Chen2020 熵熱係數預設零；Marquis2019 包含電極熵熱係數。公開參數集不是使用者電芯，不宜直接比較不同容量模型的 W。未計接觸電阻、遲滯或混合熱，總熱為歐姆＋不可逆反應＋可逆熱。

`heat_w` 為整顆 Total heating [W]；`heat_w_m3 = heat_w / Cell volume [m3]` 為均質化電芯熱源，非局部電極來源。CFD 匯出為 N×Q/CFD總物件體積；數量只縮放同工況電芯，不耦合電池包電路、分流與溫差。

重建：`PYBAMM_DISABLE_TELEMETRY=true python scripts/generate_pybamm.py`。測試：`node --test tests/*.test.mjs`。BSD-3-Clause 聲明位於 `licenses/PyBaMM-BSD.txt`。
