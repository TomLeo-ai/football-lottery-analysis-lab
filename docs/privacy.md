# 隐私说明

本项目默认使用虚构样例；只有用户声明图片为自有或已获授权时，才应处理真实截图。v0.2.0 的截图路径采用 real local Tesseract OCR（真实本地 Tesseract OCR），原图和完整 OCR 文本不跨越浏览器写入边界。

## 浏览器内处理边界

- `File`、`Blob`、Object URL、位图、Canvas 像素、完整 OCR 文本和逐词结果只存在于当前页面的临时内存。
- 浏览器只向服务端发送图片类型、字节数、宽高等创建元数据，以及经过映射的最小结构化候选；不发送图片二进制、Data URL、完整 OCR 文本或原始文件名。
- 取消识别、更换图片或离开上传页时会释放预览 URL、位图和 Canvas，并清除本地候选。成功进入核对页时也会释放图片资源，只短暂交接已校验的结构化候选。
- 每个活动 OCR 控制器复用一个 worker；取消、更换输入、失败或页面销毁会使结果失效并请求终止 worker。终止等待默认以 1 秒为界，迟到结果不得写入状态。

## 浏览器存储边界

- `LocalStorage`、Cache Storage 和 Service Worker 不得保存任何用户派生数据。
- `sessionStorage` 只允许保存当前 `workflowId`，以及失败恢复所需的短期、非敏感 `pendingCreate` / `pendingWrite` 元数据；不得包含图片、文件名、比赛或市场正文、完整 OCR 文本、候选证据或 API Key。
- IndexedDB 只允许 Tesseract 缓存公共、版本化的 `eng` 和 `chi_sim` 语言模型。当前缓存命名空间为 `football-lab-ocr/tesseract-7.0.0/4.0.0_best_int`；不得缓存 File、Blob、像素、OCR 结果、候选或可编辑草稿。
- IndexedDB 不可用时，适配器关闭持久缓存并提示用户；同源模型已能载入时，本次识别仍可继续。

## 保存、恢复与删除

- 人工保存后的可编辑草稿由服务端按 revision 持久化。页面刷新或后端进程重启后，只能凭显式 `workflowId` 恢复该工作流；系统不会猜测“最新工作流”。
- 确认前可调用 `DELETE /api/ocr/workflows/{workflowId}` 放弃流程。服务端会清空截图任务载荷、OCR 载荷和活动草稿；为幂等与状态审计保留的最小元数据或墓碑不应被误认为用户内容。
- 确认成功后，服务端清空 OCR 临时字段和可编辑草稿，只保留结构化 `USER_SCREENSHOT_CONFIRMED` 快照、权威链标识和最小操作审计。原图及完整 OCR 文本从未进入 v2 服务端写入边界。
- 未确认字段不得进入分析；分析和方案必须从服务端确认快照读取权威输入。

## 仓库规则

- 禁止提交真实用户截图、完整 OCR 文本或其他用户派生内容。
- 禁止提交官方截图、Logo 或复制页面素材。
- 禁止提交密钥、Token、Cookie 或浏览器会话。
- 示例图片必须为项目自有的虚构内容，并显著标注 `DEMO DATA / FICTIONAL SAMPLE`。

