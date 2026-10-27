# Phase 2 粒子天体与交互改造

本次保留原有 BodySystem、velocity-Verlet 积分、双星／三体／弹弓、轨道拖尾、S/B/T/L 和自动部署。改造视觉层与输入链路；不是重新实现 Phase 2。

## 视觉与创造

- 用共享 BufferGeometry + ShaderMaterial Points 替换原 SphereGeometry 与大光晕：70% 均匀 Fibonacci 球面（微扰）、12% 内部体积、18% 外围星尘。前后层亮度、定向着色和局部旋转建立体积感，不提高 Bloom 或曝光。
- 外围星尘可变为倾斜程序化星环；Sphere / Ring / Nebula 按时间步长连续混合。没有逐粒子 CPU 更新，也没有为每个粒子创建 Mesh。
- 捏合立即预览聚集，650 ms 完成成形。持续至少 450 ms 后松开，经 40 ms 释放防抖，只创建一个物理天体。短捏合、识别丢失取消预览。已释放天体持续存在。
- 释放时将同一 Points 对象交给物理天体，保留可见位置、半径、粒子缓冲区及旋转相位；未完全成形的最后一段快速收束。鼠标／触屏在 S 模式长按也支持预览；原来轻点放置的操作保留。
- 背景星系粒子根据粒子天体的解析体积适度遮挡，减少透过主体的背景亮斑。没有额外实体遮挡球。星环和星云仅改变外观，不改变质量与引力。
- 已查看用户提供的 32 秒视频抽帧，参考其球体／倾斜星环／扩散之间的空间关系；没有将视频作为应用资产上传。

## 延迟诊断与测量

基线代码将识别限制为每 50 ms 一次，位置指数平滑 rate=9/s，场强 rate=5/s，创建等待 1.1 s 后突然生成球体。修复后位置 rate=16–48/s（小幅运动稳定，大幅运动快速），场强 24/s；输入与形态使用墙钟时间，独立于物理惯性。

| 指标 | 改造前 | 改造后 | 测量范围 |
|---|---:|---:|---|
| 位置阶跃达到 90% | 266.7 ms | 66.7 ms | Chromium，受控 60 Hz，合成输入 |
| 场强阶跃达到 90% | 466.7 ms | 100 ms | 同上 |
| 识别调度上限 | 20 次/s | 30 次/s | 零耗时模拟结果；实际吞吐受推理耗时限制 |
| 静止小幅交替噪声 RMS | 输入 0.05 单位 | 输出 0.00681 单位 | 合成噪声，不是实机手抖测量 |
| 星环混合达到 90% | 无此形态 | ≤220 ms | 实际浏览器 uniform 采样断言 |
| 星云混合达到 90% | 无此形态 | ≤150 ms | 同上 |
| 完整捏合成形 | 1.1 s 后突然出现 | 650 ms 连续成形 | 识别观测时间，不含相机采集延迟 |

测量原始记录位于 `measurements/response-before.json` 与 `response-after.json`。基线中的 pausedFrameMeanMs / pausedDrawCalls 仅是提交侧诊断，不作为 FPS 或 GPU 性能结论。`scripts/measure-response.mjs` 可在开发服务器运行时复测新链路。

参考视频离线片段在云端 SwiftShader + 原 GPU delegate 中推理中位 346.9 ms、P95 372.9 ms，25 帧均未检出手。该结果只说明这组录影片段／环境没有成功识别，**不能证明真实手势可用**，也不能代表硬件 GPU 的速度。原始记录在 `measurements/recorded-inference.json`。

因此将模型移到独立 classic Worker，单帧 ImageBitmap 转移、不排队，结束后释放位图；采用 CPU delegate 留出渲染 GPU。测试中发现并修复了模型尚未 ready 时提前提交帧的竞争。模型失败、关闭、页面隐藏均结束 Worker 与摄像头；超过期限的结果不继续控制场景。

最终独立探针以真实模型处理 640×480 合成视频：首帧约 390 ms，随后 7 帧 36.2–48.6 ms；捕获到结果约 37.3–50.5 ms，主线程回调中位间隔 16.7 ms、P95 66.7 ms，8 次推理期间共 37 次回调；最多一帧在途。记录在 `measurements/worker-inference.json`。与前述录影片段的尺寸／内容／后端不同，**不能作为同输入模型加速比**。探针不渲染完整宇宙，也不是全场景 FPS 测试。

开发模式控制台 `poetryDiagnostics()` 可分别读取推理耗时、捕获至结果耗时、结果间隔、结果年龄、在途帧数和控制位置。相机传感器／驱动延迟没有实机数据，不能把上述数字拼成端到端延迟。

## 性能与资源

- 桌面每个天体 4,096 点，移动端 2,048 点；最多三颗恒星，保留原低质量弹弓探针上限。
- 一份共享静态位置／目标／粒子属性缓冲区约 192 KiB（移动端 96 KiB），每个天体只新增材质 uniform 与现有轨迹。主体每颗 1 draw call，加轨道 1 次；此前实体球＋光晕＋轨道是 3 次。
- 预览额外 1 次 Points 绘制，提交后复用，无不断增长的粒子池。形态变化不上传整块位置缓冲区。
- 背景遮挡增加最多 5 个解析体积的顶点计算；这是清晰轮廓的额外 GPU 成本。没有降低原星系粒子数来制造性能提升。
- 摄像头增加每帧位图传输与 Worker 的模型内存。CPU 推理也占用计算资源；低端设备、硬件摄像头和长时间热降频仍需实机验证。

## 验证与边界

- TypeScript／生产构建通过。保留已有大于 500 kB 的包体提示，无新增构建错误。
- 首批 12 项单元测试、9 项 Chromium 浏览器测试通过；引入 Worker 后仅补跑受影响的创建／模型失败用例与新增长按用例（3 项通过），并单独运行新增 Worker 排队／取消测试（1 项通过）。共覆盖 13 个单元用例、10 个不同浏览器用例，没有重复跑完整套件。
- 原有双星能量／动量、三体稳定数值、真实弹弓能量转移、GPU 引力响应、启动亮度、刷新／resize、相机失败、移动布局用例保留。
- 新增检查：球面分布／极区均匀性、30/60/120 Hz 形态响应一致、视觉缓冲区不改写、合成地标连续创建、单次释放、丢失追踪取消、旋转相位／半径交接、Worker ready 前不提交／忙时不积压／取消释放位图。
- 最终生产包已验证真实模型 Worker 初始化、至少一帧推理完成及关闭摄像头；不是仅凭按钮状态判断推理成功。
- 已实际查看 Chromium 的球体、星环、星云、双星及系统面板截图。合成地标验证控制逻辑；真实模型＋合成视频验证推理与生命周期；没有真实摄像头，未声称完成真实手势准确率或硬件 GPU 稳定帧率验收。

## 文件范围

- `src/particles/CelestialParticle.ts`：粒子分布、着色与形态；`src/scene/CelestialBodies.ts`：预览／释放／轨道视图；`src/particles/Galaxy.ts`：背景遮挡。
- `src/gestures/Hands.ts`、`HandInference.ts`、`inference.worker.ts`：捏合状态、诊断与独立推理。
- `src/scene/Universe.ts`、`src/physics/field.ts`、`src/interactions/Pointer.ts`：控制契约与渲染连接；物理积分器未改。
- `src/app/App.tsx`、`style.css`：形态选择和操作提示。
- `scripts/prepare-assets.mjs`、`.gitignore`：本地复制固定版本模型运行库；`scripts/test-camera.mjs` 与 `measure-*.mjs`：验证／诊断。
- `tests/unit/{bodies,celestial,inference}.test.ts`、`tests/browser/{particle-bodies,visual-stability}.spec.ts`；README、ARCHITECTURE 与本报告／测量 JSON。

沿用现有 GitHub Actions 与 Pages 工作流，部署结果另以该提交的运行记录及线上资产版本确认。
