# AI Town City V3 — Tiled 空间数据源

本目录是城市场景空间信息的唯一数据源。前端不再维护建筑、停车位、路线或入口坐标；`city-v3.tmj` 编译为前端 manifest 与 AI Town `bgtiles/objmap`。

## 编辑流程

1. 用 Tiled 打开 `city-v3.tiled-project`，再打开 `city-v3.tmj`。
2. 编辑对象、折线、区域或 `bgtiles`。`objmap` 是锁定生成层，不应手动修改。
3. 运行 `npm run city:compile`，随后运行 `npm run city:check` 与 `npm run build`。
4. 浏览 `/policy-town?debugMap=1` 检查网格、碰撞、车辆排除区、停车位、入口和路线。

`npm run city:bootstrap` 只用于重建初始工程，会覆盖本目录的 TMJ、TSJ、模板和 Automapping 规则；日常编辑后不要运行它。

## 固定图层

- `bgtiles`：可编辑城市地块。GID 1–4 对应地块、草地、机动车道、步行区。
- `objmap`：由建筑和设施脚印自动生成，GID 5 表示阻挡。
- `buildings`、`living`、`props`：模板实例。
- `parking`：合法车位；静态车辆只引用车位 ID。
- `vehicle_routes`、`actor_routes`：Tiled 折线。
- `portals`：建筑入口、部门节点、公交站入口。
- `zones`：机动车、步行和公共空间区域。

## 严格校验

地图编译器会拒绝缺层、重复 ID、失效模板或资源、日夜尺寸/alpha 不一致、入口不可达、停车冲突、车辆越出机动车区、路线穿碰撞体、公交不到站和生成物过期。碰撞只取对象底部脚印；建筑立面另外使用 `vehicleExclusion` 避免视觉压楼。

运行时调试色：红色为 `objmap`，橙色为车辆排除区，青色为停车位，黄色为车辆路线，绿色为人物路线与入口。

## 第三方场景细节

`props` 中的信号灯、垃圾桶、锥桶、消防栓、邮箱、售货机、花箱、井盖、裂纹和排水口来自项目内 CC0 素材目录，经 `npm run city:assets` 确定性裁切、2× nearest-neighbor 缩放及日夜配色后写入 `public/assets/city-v3/third-party/`。原始素材、哈希和许可记录见 `assets/third-party/city-assets/CATALOG.md`；MetroCity 预览和等距车辆未用于生产画面。
