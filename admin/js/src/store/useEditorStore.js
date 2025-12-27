import { create } from 'zustand';
import { mmToPixels, distance } from '../utils/geometry';

export const useEditorStore = create((set, get) => ({
    // State
    elements: [],
    selectedElements: [],
    selectedTool: 'line', // 'line', 'arc', 'select', 'delete'
    grid: {
        stepMM: 1,
        snap: true,
        visible: true,
        showMajorLines: false,
    },
    dimensionsVisible: true,
    orthogonalSnap: true, // Ортогональная привязка включена по умолчанию
    viewbox: {
        x: 0,
        y: 0,
        width: 800,
        height: 400,
    },
    isDrawing: false,
    currentLineStart: null,
    
    // Actions
    setSelectedTool: (tool) => set({ selectedTool: tool, selectedElements: [] }),
    addElement: (element) => set((state) => ({
        elements: [...state.elements, { ...element, id: `element-${Date.now()}-${Math.random()}` }],
    })),
    updateElement: (id, updates) => set((state) => ({
        elements: state.elements.map((el) =>
            el.id === id ? { ...el, ...updates } : el
        ),
    })),
    deleteElement: (id) => set((state) => ({
        elements: state.elements.filter((el) => el.id !== id),
        selectedElements: state.selectedElements.filter((el) => el.id !== id),
    })),
    deleteSelectedElements: () => set((state) => {
        const selectedIds = new Set(state.selectedElements.map(el => el.id));
        return {
            elements: state.elements.filter((el) => !selectedIds.has(el.id)),
            selectedElements: [],
        };
    }),
    selectElement: (element, isMultiSelect = false) => {
        return set((state) => {
            if (!element) {
                return { selectedElements: [] };
            }
            
            if (isMultiSelect) {
                const exists = state.selectedElements.some(el => el.id === element.id);
                if (exists) {
                    return { selectedElements: state.selectedElements.filter(el => el.id !== element.id) };
                } else {
                    return { selectedElements: [...state.selectedElements, element] };
                }
            } else {
                return { selectedElements: [element] };
            }
        });
    },
    loadProfile: (data) => set({
        elements: data.elements || [],
        grid: data.grid || { stepMM: 1, snap: true, visible: true, showMajorLines: false },
        viewbox: data.viewbox || { x: 0, y: 0, width: 800, height: 400 },
    }),
    setCurrentLineStart: (point) => set({ currentLineStart: point }),
    setIsDrawing: (isDrawing) => set({ isDrawing }),
    toggleDimensionsVisible: () => set((state) => ({
        dimensionsVisible: !state.dimensionsVisible,
    })),
    toggleMajorLines: () => set((state) => ({
        grid: { ...state.grid, showMajorLines: !state.grid.showMajorLines },
    })),
    toggleOrthogonalSnap: () => set((state) => ({
        orthogonalSnap: !state.orthogonalSnap,
    })),
    updateFilletRadius: (filletId, newRadiusMM) => {
        return set((state) => {
            const fillet = state.elements.find(el => el.id === filletId && el.type === 'fillet');
            if (!fillet) return state;

            const newRadius = mmToPixels(newRadiusMM);
            const { connection, line1Direction, line2Direction, angle1, angle2, line1Id, line2Id, line1EndTruncated, line2EndTruncated } = fillet;

            // Вычисляем новые точки начала и конца арки (используем сохраненные направления)
            const arcStartPoint = {
                x: connection.x + line1Direction.x * newRadius,
                y: connection.y + line1Direction.y * newRadius,
            };
            const arcEndPoint = {
                x: connection.x + line2Direction.x * newRadius,
                y: connection.y + line2Direction.y * newRadius,
            };

            // Вычисляем центр арки как пересечение перпендикуляров от точек арки к линиям
            // Используем тот же алгоритм, что и в createFilletAtCorner
            const dir1 = line1Direction;
            const dir2 = line2Direction;
            
            // Перпендикуляры к линиям от точек арки
            // Перпендикуляр к dir1 (поворот на 90° против часовой стрелки)
            const perp1Dir = { x: -dir1.y, y: dir1.x };
            // Перпендикуляр к dir2 (поворот на 90° против часовой стрелки)
            const perp2Dir = { x: -dir2.y, y: dir2.x };
            
            // Определяем направление перпендикуляров внутрь угла
            // Вычисляем направление биссектрисы для определения направления
            const bisectorDirUnnormalized = {
                x: dir1.x + dir2.x,
                y: dir1.y + dir2.y
            };
            const bisectorLength = Math.sqrt(bisectorDirUnnormalized.x * bisectorDirUnnormalized.x + bisectorDirUnnormalized.y * bisectorDirUnnormalized.y);
            const bisectorDir = bisectorLength > 0.0001
                ? { x: bisectorDirUnnormalized.x / bisectorLength, y: bisectorDirUnnormalized.y / bisectorLength }
                : { x: -dir1.y, y: dir1.x };
            
            // Проверяем, направлены ли перпендикуляры внутрь угла
            const perp1Dot = perp1Dir.x * bisectorDir.x + perp1Dir.y * bisectorDir.y;
            const perp2Dot = perp2Dir.x * bisectorDir.x + perp2Dir.y * bisectorDir.y;
            
            const finalPerp1Dir = perp1Dot > 0 ? perp1Dir : { x: -perp1Dir.x, y: -perp1Dir.y };
            const finalPerp2Dir = perp2Dot > 0 ? perp2Dir : { x: -perp2Dir.x, y: -perp2Dir.y };
            
            // Пересечение прямых: arcStartPoint + t * finalPerp1Dir и arcEndPoint + s * finalPerp2Dir
            const dx = arcEndPoint.x - arcStartPoint.x;
            const dy = arcEndPoint.y - arcStartPoint.y;
            const denom = finalPerp1Dir.x * finalPerp2Dir.y - finalPerp1Dir.y * finalPerp2Dir.x;
            
            let arcCenter;
            if (Math.abs(denom) < 0.0001) {
                // Линии параллельны, используем fallback через биссектрису
                let angleDiff = Math.abs(angle2 - angle1);
                if (angleDiff > 180) {
                    angleDiff = 360 - angleDiff;
                }
                const angleDiffRad = (angleDiff * Math.PI) / 180;
                const centerDist = angleDiffRad > 0.0001 
                    ? newRadius / Math.sin(angleDiffRad / 2)
                    : newRadius;
                arcCenter = {
                    x: connection.x + bisectorDir.x * centerDist,
                    y: connection.y + bisectorDir.y * centerDist,
                };
            } else {
                const t = (dx * finalPerp2Dir.y - dy * finalPerp2Dir.x) / denom;
                arcCenter = {
                    x: arcStartPoint.x + t * finalPerp1Dir.x,
                    y: arcStartPoint.y + t * finalPerp1Dir.y,
                };
            }

            // Вычисляем углы от центра к начальной и конечной точкам
            const arcStartAngleRad = Math.atan2(arcStartPoint.y - arcCenter.y, arcStartPoint.x - arcCenter.x);
            const arcEndAngleRad = Math.atan2(arcEndPoint.y - arcCenter.y, arcEndPoint.x - arcCenter.x);
            
            // Вычисляем угол дуги как разность углов от начальной точки к конечной
            let arcAngleRad = arcEndAngleRad - arcStartAngleRad;
            
            // Нормализуем угол к диапазону [-π, π]
            if (arcAngleRad > Math.PI) {
                arcAngleRad -= 2 * Math.PI;
            } else if (arcAngleRad < -Math.PI) {
                arcAngleRad += 2 * Math.PI;
            }
            
            let arcStartAngle = arcStartAngleRad * (180 / Math.PI);
            if (arcStartAngle > 180) arcStartAngle -= 360;
            if (arcStartAngle < -180) arcStartAngle += 360;

            // Угол дуги всегда должен быть положительным
            const arcAngle = Math.abs(arcAngleRad) * (180 / Math.PI);

            // Находим линии для обрезки
            const line1 = state.elements.find(el => el.id === line1Id);
            const line2 = state.elements.find(el => el.id === line2Id);

            if (!line1 || !line2) return state;

            // Сохраняем исходные длины
            const originalLine1Length = line1.length || distance(line1.start, line1.end);
            const originalLine2Length = line2.length || distance(line2.start, line2.end);

            // Используем сохраненную информацию о том, какой конец обрезается
            // Если line1EndTruncated undefined (старые fillet без этой информации), используем расстояние как fallback
            let shouldTruncateLine1End = line1EndTruncated;
            let shouldTruncateLine2End = line2EndTruncated;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useEditorStore.js:127',message:'updateFilletRadius truncation check',data:{line1EndTruncated,line2EndTruncated,line1:{start:line1.start,end:line1.end},line2:{start:line2.start,end:line2.end},connection},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            if (shouldTruncateLine1End === undefined || shouldTruncateLine2End === undefined) {
                // Fallback для старых fillet: определяем по расстоянию до connection
                const distToLine1Start = distance(connection, line1.start);
                const distToLine1End = distance(connection, line1.end);
                const distToLine2Start = distance(connection, line2.start);
                const distToLine2End = distance(connection, line2.end);
                shouldTruncateLine1End = distToLine1End < distToLine1Start;
                shouldTruncateLine2End = distToLine2End < distToLine2Start;
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useEditorStore.js:138',message:'updateFilletRadius fallback calculation',data:{distToLine1Start,distToLine1End,distToLine2Start,distToLine2End,shouldTruncateLine1End,shouldTruncateLine2End},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
            }

            // Обновляем элементы
            const updatedElements = state.elements.map((el) => {
                if (el.id === filletId) {
                    // Обновляем fillet
                    const updatedFillet = {
                        ...el,
                        radius: newRadius,
                        arc: {
                            center: arcCenter,
                            radius: newRadius,
                            startAngle: arcStartAngle,
                            angle: arcAngle,
                        },
                        arcStartPoint: arcStartPoint,
                        arcEndPoint: arcEndPoint,
                        line1EndTruncated: shouldTruncateLine1End,
                        line2EndTruncated: shouldTruncateLine2End,
                    };
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useEditorStore.js:150',message:'updateFilletRadius fillet update',data:{filletId,newRadius,arcStartPoint,arcEndPoint,shouldTruncateLine1End,shouldTruncateLine2End},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    return updatedFillet;
                } else if (el.id === line1Id) {
                    // Обрезаем line1 используя сохраненную информацию
                    const update = shouldTruncateLine1End
                        ? { end: arcStartPoint, length: originalLine1Length }
                        : { start: arcStartPoint, length: originalLine1Length };
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useEditorStore.js:162',message:'updateFilletRadius line1 update',data:{line1Id,update,shouldTruncateLine1End,arcStartPoint,originalLine1Length},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    return { ...el, ...update };
                } else if (el.id === line2Id) {
                    // Обрезаем line2 используя сохраненную информацию
                    const update = shouldTruncateLine2End
                        ? { end: arcEndPoint, length: originalLine2Length }
                        : { start: arcEndPoint, length: originalLine2Length };
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useEditorStore.js:173',message:'updateFilletRadius line2 update',data:{line2Id,update,shouldTruncateLine2End,arcEndPoint,originalLine2Length},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B'})}).catch(()=>{});
                    // #endregion
                    
                    return { ...el, ...update };
                }
                return el;
            });

            return { elements: updatedElements };
        });
    },
}));


