# 城市美术素材目录

整理日期：2026-08-12

本目录只保存第三方原始素材、解压内容、来源与许可证记录。正式游戏内使用的裁切、调色、重绘和图集，请另存到生产素材目录，避免覆盖上游文件。

## 选材结论

| 用途 | 首选来源 | 当前状态 | 使用备注 |
| --- | --- | --- | --- |
| 政府、A/B/C/D、中央广场 | 统一生图 | 待生成 | 同一母提示词、同一相机、同一描边、同一光源；每栋同时产出日/夜版本。 |
| 道路与人行道 | LPC Modern Streets | 已下载并解压 | 32×32；道路、裂缝、排水沟、井盖、标线可直接分层拼接。 |
| 街具 | LPC Modern Streets + Kenney RPG Urban | 已下载并解压 | LPC 负责红绿灯、围栏、垃圾桶、路牌等；Kenney 补树、路障、箱柜、灯具和小型填充。 |
| 车辆 | Kenney Isometric Vehicles | 已下载并解压 | 车型和方向最全，但属于等距视角；只能在最终地图也是等距视角时直接使用。 |
| 车辆补充 | OpenGameArt Pixel Art Vehicles | 已保存原图 | 公交、校车、消防车、货车及 8 辆小车；用于补车型或作为重绘参考。 |
| 绿化与普通填充 | Kenney RPG Urban + MetroCity | Kenney 完整；MetroCity 预览已保存、原包待补 | MetroCity 可补树、住宅、远景楼；下载原包后再进入生产选材。 |

## 视角兼容规则

- LPC Modern Streets 和 Kenney RPG Urban 更接近正交俯视像素地图；Kenney Isometric Vehicles 是等距投影，不能未经处理直接混在同一画面。
- 如果最终布局采用正交俯视：车辆优先用 OpenGameArt 车辆或据 Kenney 车型重绘成俯视角。
- 如果最终布局采用等距视角：Kenney Isometric Vehicles 可直接成为车辆基准，同时核心建筑生图必须锁定同样的等距相机。
- Kenney RPG Urban 是 16×16，接入 32×32 地图时统一用 2 倍整数缩放和 nearest-neighbor，禁止双线性插值。

## 核心建筑生图规格

政府、A、B、C、D 和中央广场共用一套生成规范：

1. 先锁定地图投影、水平旋转角和俯视角，再制作第一栋基准建筑。
2. 建筑落脚面、门窗比例、黑色描边宽度、阴影方向和调色板保持一致。
3. 日/夜版本使用同一构图和透明轮廓，只改变环境光、窗灯、路灯和少量高光。
4. 每个对象保留透明 PNG、未裁切母图、日版、夜版和生成参数记录。

建议未来存放路径：`assets/generated/core-buildings/{government,a,b,c,d,central-plaza}/{day,night}/`。

## 快速入口

- `lpc-modern-streets/extracted/terrains/`：道路、人行道、裂缝、排水沟、井盖、标线
- `lpc-modern-streets/extracted/decor/`：红绿灯、围栏、垃圾桶、路牌、锥桶
- `kenney-rpg-urban/extracted/Tilemap/tilemap.png`：完整图集
- `kenney-rpg-urban/extracted/Tiles/`：486 个独立 16×16 PNG
- `kenney-isometric-vehicles/extracted/PNG/`：按 Ambulance、Civilian、Garbage、Police、Taxi 分类的独立车辆
- `kenney-isometric-vehicles/extracted/Spritesheet/`：按颜色和用途整理的图集及 XML
- `opengameart-pixel-art-vehicles/original/`：两张车辆图集
- `metrocity/previews/`：MetroCity 官方页面预览，仅供选材

各来源的许可证、哈希与下载状态见对应目录下的 `SOURCE.md`。
