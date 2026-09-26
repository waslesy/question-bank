# Question Bank App

本地离线医学刷题 App，采用空壳发布方式：不内置题库、广告、课程或论坛内容。首次使用需要自行导入题库 JSON。

## 基本操作

操作逻辑与常见刷题软件类似：

- 点击：选择选项。
- 长按：排除该选项。
- 再次长按：解除排除。

## 练习模式

- 按章节练习：集中练习某个科目下的指定章节。
- 按来源练习：按题库来源或资料层级浏览和练习。
- 全科随机：从全部可练习题目中随机抽题。
- 科目随机：从当前科目的可练习题目中随机抽题。

## 题库构建

### Question Bank JSON Skill

完整、可人工复用的 Skill 位于仓库根目录 [`question-bank-json-skill/`](question-bank-json-skill/)。其中 [`SKILL.md`](question-bank-json-skill/SKILL.md) 是主入口， [`references/FORMAT.md`](question-bank-json-skill/references/FORMAT.md) 是格式规范，`assets/` 包含 Schema 与示例，[`scripts/validate_question_bank.py`](question-bank-json-skill/scripts/validate_question_bank.py) 是 Validator。

`.agents/skills/question-bank-json/SKILL.md` 仅作为 Codex 自动发现入口，并引用根目录的单一真源；禁止复制维护两套内容。

首次使用时，可以把这个 Skill 与包含题目的资料一起交给支持文件或图片读取的 AI，例如 TXT、Markdown、PDF、Word、PNG、JPG 等题目截图或扫描件，让 AI 按 Skill 规范生成 `medical-question-bank` JSON，并通过 Validator 检查后，再导入 App 使用。

不要让 AI 直接自创 JSON 格式，应始终遵循仓库 Skill。正式题库解析应包含：`本题考查`、`考点还原`、`全选项解析`、`结论`。

## 容量与推荐规模

本 App 定位为个人、课程或学期级的小型离线题库工具，不建议为了追求题量而长期堆入超大题库。单个导入文件硬上限为 64 MB。按仓库当前完整解析示例的体量保守估算，文件容量可达到约 3 万道题的量级；这只是容量估算，不代表推荐运行规模，实际表现还会受到题干与解析长度、手机内存、WebView 解析和作答记录等因素影响。

公开高校题库并不存在统一的“平均题量”标准，但公开建设标准与课程题库案例普遍落在千题到数千题量级：有高校要求课程题库至少 1000 题，也有课程题库达到 2000～3000+ 题；医学期末题库的公开单科示例同样常见约 1000～3000+ 题。因此，本项目更建议把个人学期题库控制在约 2000～3000 题的实用规模，这对于普通大学课程与期末复习已经较为充足，也明显低于 64 MB 的容量上限。

## 数据

App 支持错题、收藏、斩题、答题记录，以及分域导出、完整备份和恢复。

正式 `medical-question-bank` v1 导入必须通过 Schema/Validator 约束：解析非空并包含完整的“本题考查、考点还原、全选项解析、结论”四段，且为实际存在的每个选项提供解析。Legacy Backup 继续按兼容迁移规则导入。单个导入文件上限为 64 MB。
