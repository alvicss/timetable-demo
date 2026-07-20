# AI 課表查詢系統產生器

這是一個純前端的課表查詢系統。使用者可以先用 Gemini、ChatGPT、Claude 等 AI，把學校原始課表整理成標準 CSV，再回到本網站匯入檔案並查詢課表。

重點：匯入後的課表資料只存在使用者自己的瀏覽器 `localStorage`，不會上傳到 GitHub、伺服器或開發者這邊。

本專案基於 [奕鈞老師的 timetable-demo](https://github.com/littleyi22/timetable-demo) 分叉改版，感謝原作者提供課表查詢系統基礎架構。

## 一般使用流程

1. 開啟網站首頁。
2. 開啟 Gemini / ChatGPT / Claude。
3. 在 AI 對話框上傳學校原始課表檔案，例如 PDF、Word、Excel 或圖片。
4. 回到網站按「提示模板」，複製 AI 轉檔 prompt。
5. 將 prompt 貼到 AI 對話框並送出。
6. 下載 AI 產生的 `timetable_import.csv` 檔案。
7. 如果 AI 平台不能提供下載檔，才把 AI 貼出的 CSV 內容另存成 `.csv`。
8. 回到網站按「匯入檔案」。
9. 按「課表搜尋」查詢班級或教師課表。

## AI 輸出的簡易 CSV 格式

網站支援下列簡易格式，適合讓 AI 產生：

```csv
school,class,day,period,subject,teacher,location
市立範例高中,機械一甲,1,1,國文,王小明,機械一甲教室
市立範例高中,機械一甲,1,2,數學,李小華,
市立範例高中,電子二乙,3,5,英文,陳美玲,
```

欄位說明：

- `school`：學校名稱。匯入後首頁會顯示這個名稱；如果沒有此欄位或值為 `UNKNOWN`，首頁顯示「課表查詢系統」。
- `class`：班級名稱。
- `day`：星期，1=星期一，2=星期二，3=星期三，4=星期四，5=星期五。
- `period`：節次，0=早自習，1~8=第 1~8 節。
- `subject`：科目名稱。
- `teacher`：教師姓名。
- `location`：地點，沒有資料可留空；目前查詢畫面不使用此欄位。

網站匯入時會把簡易 CSV 轉成內部教師寬表格式，讓既有的班級查詢、教師查詢、依教師查詢都能沿用。

## 專案目錄結構

```text
timetable-demo/
├── index.html              # 系統入口與前端版面
├── style.css               # 樣式表，含 RWD、深淺色模式、彈窗
├── app.js                  # 核心邏輯：匯入、CSV 解析、查詢、課表渲染
├── config.js               # 預設系統名稱與節次時間設定
├── homerooms_sample.json   # 導師 JSON 格式範例
└── .agents/                # AI 技能與資料轉換 SOP
```

## 功能特色

- 純前端靜態網頁，無後端、無資料庫。
- 首頁內建 AI 轉檔提示模板，會要求 AI 優先產生可下載的 CSV 檔案。
- 支援使用者匯入本機 CSV，資料存在自己的瀏覽器。
- 公開版不內建真實課表資料；使用者需先匯入自己的 CSV。
- 支援班級查詢、教師查詢、依教師查詢完整課表或單一科目。
- 支援深淺色模式、手機和平板 RWD、列印課表。

## 開發預覽

本專案不需要 build。用任一靜態伺服器開啟即可，例如：

```bash
python -m http.server
```

然後開啟：

```text
http://localhost:8000/
```
