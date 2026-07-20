# 專案狀態

本文件記錄「AI 課表查詢系統產生器」目前進度。公開版不保留任何真實學校課表資料、教師姓名或原始檔名。

## 專案來源

本專案 fork 自 `littleyi22/timetable-demo` 課表查詢系統範本，並改造成「使用者自行匯入 CSV」的純前端工具。

## 目前狀態（2026-07-21）

- 預設入口為「AI 轉檔教學首頁」，不需要登入即可使用。
- 2026-07-21：已將網站「提示模板」改為直接載入 `docs/100_課表CSV轉換標準Prompt.md` 的完整 text 區塊，文件成為唯一 Prompt 來源；原本內建於 `app.js` 的精簡版已備份至 `docs/101_網站舊版Prompt備份_2026-07-21.md`。
- 2026-07-20：完成 `1142班級課表.docx` 解析腳本，自動從 Docx 內表格與學分表提取並交叉比對，產出符合匯入標準之 `timetable_import.csv`。
- 2026-07-20：完成 `1142教師課表.docx` 與 `1142班級課表.docx` 之 CSV 轉換，產出 `timetable_import_agy2.csv`、`timetable_summary_agy2.csv`、`teacher_review_agy2.csv`。
- 2026-07-20：新增 `docs/100_課表CSV轉換標準Prompt.md`，統一班級課表與教師課表的交叉比對、去重、教師推定及三份 CSV 統計核對規則。
- 2026-07-20：CSV 匯入新增 UNKNOWN 類待確認教師檢查；匯入前逐筆顯示原始列號、班級、星期、節次、科目與原值，使用者可取消修正或明確選擇仍然匯入。繼續匯入時保留課程，但佔位值不進入教師查詢。
- 2026-07-20：`.gitignore` 新增全專案 `*.py`、`*.txt`、`*.log`、`*.json` 忽略規則，避免本機解析腳本與中繼資料誤入版控；既有已追蹤檔案維持原狀。
- 2026-07-20：以 Claude Code（本機）重新解析 `1142班級課表.docx`＋`1142教師課表.docx`，產出 `timetable_import_CLAUDE2.csv`，做為與既有 `timetable_import_CLAUDE.csv`／`_GEMINI.csv`／`_GPT.csv` 三份跨平台比較的第四份對照樣本。做法：班級課表用 python-docx 直接讀文字（含拆解合班分組課、多教師協同教學），教師課表因儲存格內容是圖片而非文字，改將 docx 轉 PDF 後逐頁 render 成圖片，派多個 subagent 平行以視覺辨識轉錄，再與班級課表交叉比對、校正科目截斷字與教師姓名罕見字問題。過程中的中繼腳本／JSON／log（`parse_class_docx.py`、`split_combined_subjects.py`、`parse_teacher_transcripts.py`、`merge_final_csv.py`、`class_schedule_v*.json`、`teacher_schedule.json`、`merge_output.log` 等）留在專案根目錄供之後核對，非網站程式碼、未使用時可清除。
- 首頁提供三個主要操作：
  - `提示模板`：顯示可複製的 AI 轉檔 prompt，要求 AI 優先產生可下載的 `timetable_import.csv`；prompt 已加入「班級課表 × 教師課表交叉比對」指示，要 AI 盡量補齊真正的授課教師、少用 UNKNOWN。
  - `匯入檔案`：使用者匯入 AI 轉好的 CSV。
  - `課表搜尋`：讀取本機匯入資料後進入查詢畫面。
- 匯入格式採簡易 CSV：

```csv
school,class,day,period,subject,teacher,location
```

- `school` 欄位會儲存在瀏覽器 `localStorage`，下次開啟首頁會顯示該學校名稱；若缺少、空白或為 `UNKNOWN`，首頁顯示「課表查詢系統」。
- 匯入資料只存在使用者自己的瀏覽器 `localStorage`，不會上傳到 GitHub、伺服器或開發者端。
- 公開版不內建真實課表資料；尚未匯入 CSV 時，系統會提示先匯入檔案。
- 查詢功能包含：
  - 班級查詢
  - 教師查詢
  - 依教師查詢完整課表或單一科目
- 介面功能包含：
  - 深淺色模式
  - 手機、平板 RWD
  - 課表列印
  - 原作者致謝文字
  - AJ 標準免責聲明與 footer

## 已知限制／待確認事項

- 使用者匯入資料目前存在瀏覽器 `localStorage`，換裝置、換瀏覽器、清除網站資料後需要重新匯入。
- AI 轉出的 CSV 可能有漏列、錯位、`UNKNOWN` 等問題；目前匯入流程會檢查必要欄位與 day/period 範圍，但尚未提供完整的逐格預覽與衝堂檢查。
- `teacher` 欄允許空白；若出現 UNKNOWN、未知、N/A、待確認等明確佔位值，匯入前會先列出問題明細並要求使用者取消修正或明確確認。使用者仍然匯入時，程式會把這類課程以「班級＋科目」當獨立主鍵，保留在班級課表但不顯示教師連結，也不加入教師查詢／依師查詢的下拉與候選清單。
- 已修正深色模式下原生 `<select>` 下拉在多螢幕、不同縮放比例時彈出位置錯誤的問題（改由 `style.css` 移除會長期停留的 view 進場動畫）。
- `location` 欄位目前可匯入，但查詢畫面尚未顯示。
- 公開 repo 不加入真實學校課表、教師資料、原始 PDF/Word、AI 本機設定與本機匯入 CSV。

## 環境

- 網站本身為純前端 HTML/CSS/JavaScript，無需後端服務。
- Python 隔離環境只用於開發期資料處理或測試，不是網站執行期依賴。
