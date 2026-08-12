# AI Town City Art Guide

## 1. 场景基准

- 逻辑画布固定为 `1920×1080`，浏览器只做等比缩放与居中，不改变场景布局。
- 统一使用晚 1990 年代 JRPG 风格的 16-bit 像素画：清晰像素块、无抗锯齿、nearest-neighbor 缩放。
- 建筑和大型设施使用略俯视的正面三分之四视角；光源固定来自左上方。
- 主体使用 2–4 px 深蓝灰描边。远景对比度与饱和度必须低于核心建筑。

## 2. 比例与层级

| 类型 | 场景显示高度 | 视觉要求 |
| --- | ---: | --- |
| C · AI 转型总部 | 470–500 px | 全场最高，双翼差异最明显 |
| A · 成熟期总部 | 400–440 px | 第二高，厚重对称 |
| B · 增长期总部 | 330–380 px | 扩建侧翼与施工痕迹 |
| 政府 | 330–370 px | 四部门与中央会议厅 |
| D · 外包服务中心 | 170–220 px | 最低最宽，普通预制办公楼 |
| 生活建筑 | 120–250 px | 明显低于核心建筑 |
| 远景建筑 | ≤180 px | 降饱和、降对比，不抢主体 |

渲染顺序固定为：天空 → 远景 → 中景 → 地面道路 → 建筑与生活区 → 街具 → 车辆 → 人物 → 局部灯光 → 昼夜按钮。

## 3. 日夜配对规范

- 文件命名：`<asset>-day-v3.png`、`<asset>-night-v3.png`；需要独立发光图时使用 `<asset>-emissive-v3.png`。
- 日夜图片必须尺寸、锚点和 alpha mask 完全相同；不得分别裁切或改变轮廓。
- 夜间素材必须改变自身材质色、明暗和局部反射，不能依赖高透明度全屏遮罩。
- 环境统一色层最大 alpha 为 `0.15`；窗灯、路灯、商铺灯箱和车灯使用独立发光层。
- 昼夜转换总时长 `1600ms`：先改变天空与远景，再交叉渐变主体，最后点亮局部灯光。

## 4. 色板与光照

- 日间天空：青蓝到暖灰；地面避免高饱和草绿。
- 日间主体：暖砖、石灰岩、钢蓝和低饱和青灰。
- 夜间材质：海军蓝、靛青、暗紫灰；保留各企业原本的材质区别。
- 普通窗灯使用暖黄 `#FFC45F`，政府会议区使用 `#FFD77A`，C 的 AI 翼可使用冷青 `#89EFFF`。
- 光晕必须分为灯芯、近距离柔光和地面投光，不使用规则的大面积实心圆。

## 5. 透明素材与图集

- 所有 sprite 使用 RGBA PNG，四角 alpha 必须为 0，无色键毛边、无外部投影、无地面残片。
- 独立素材至少保留 6 px 透明安全边；多对象图集必须使用固定网格并保持单元间隔。
- 车辆图集采用 `3×2` 网格；街具图集采用 `4×2` 网格。运行时只通过明确 frame 读取单元。
- 透明边缘验证后才能打包；发现孤立连通块、相邻素材碎片或洋红残色必须退回处理。

## 6. ImageGen 提示词基线

```text
Use case: stylized-concept.
Asset type: isolated frontend game sprite.
Style: coherent AI Town-inspired late-1990s JRPG 16-bit pixel art,
crisp deliberate pixels, no antialiasing, slightly elevated three-quarter view,
upper-left daylight, consistent scale and outline.
Backdrop: perfectly flat #FF00FF chroma-key background.
Constraints: full subject visible with generous padding; no text, logo, people,
road, floor plane, cast shadow, glow, lit windows, scenery, or watermark.
```

建筑提示词必须额外写明楼层、材质、体量、功能与禁止出现的豪华元素。夜间版本不得重新生成轮廓，而应从日间素材编辑或确定性调色，并复用日间 alpha mask。

## 7. 交付检查

- [ ] 日夜尺寸和 alpha mask 完全一致。
- [ ] 四角透明，无洋红边缘和裁切碎片。
- [ ] 透视、描边、光源与比例符合本规范。
- [ ] nearest-neighbor 缩放后像素保持锐利。
- [ ] 日间、过渡 35%、过渡 65%、夜间均无重影和突变。
- [ ] 1920×1080、1600×900、1366×768、1440×900 下完整可见。
- [ ] 车辆、人物和灯光不穿越建筑主体。
