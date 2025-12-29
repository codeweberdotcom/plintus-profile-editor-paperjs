import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { snapToGrid, snapToOrthogonal, isPointOnLine, distance, mmToPixels, pixelsToMM, formatLengthMM, findConnectionPoint, lineDirection, pointAtDistance } from '../../utils/geometry';
import Grid from './Grid';
import './CanvasEditor.css';

function CanvasEditor() {
    
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const paperScopeRef = useRef(null);
    const [paperProject, setPaperProject] = useState(null);
    const [containerSize, setContainerSize] = useState({ width: 800, height: 400 });
    const [draggingPoint, setDraggingPoint] = useState(null); // Array of { elementId, pointType: 'start' | 'end' }
    const [hoveredPoint, setHoveredPoint] = useState(null); // { elementId, pointType: 'start' | 'end' }
    const [isPanning, setIsPanning] = useState(false); // Состояние для перетаскивания view
    const [panStartPoint, setPanStartPoint] = useState(null); // Начальная точка для pan
    const [initialViewCenter, setInitialViewCenter] = useState(null); // Исходный центр view
    const isMiddleButtonPressedRef = useRef(false); // Флаг для отслеживания средней кнопки мыши
    
    const {
        elements,
        selectedElements,
        selectedTool,
        grid,
        dimensionsVisible,
        debugNumbersVisible,
        orthogonalSnap,
        currentLineStart,
        isDrawing,
        setCurrentLineStart,
        setIsDrawing,
        addElement,
        deleteElement,
        selectElement,
        deleteSelectedElements,
        updateElement,
    } = useEditorStore();

    const gridStepPixels = mmToPixels(grid.stepMM);
    const viewbox = useEditorStore((state) => state.viewbox);
    const zoom = useEditorStore((state) => state.zoom);
    const { zoomIn, zoomOut, setZoom, resetZoom } = useEditorStore();
    const prevZoomRef = useRef(zoom); // Для отслеживания изменений zoom

    // Обновление размеров контейнера
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setContainerSize({ width: rect.width, height: rect.height });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    // Инициализация Paper.js
    useEffect(() => {
        if (!canvasRef.current) {
            return;
        }

        // Ждем загрузки Paper.js
        if (typeof paper === 'undefined') {
            const checkPaper = setInterval(() => {
                if (typeof paper !== 'undefined') {
                    clearInterval(checkPaper);
                    initializePaper();
                }
            }, 100);
            return () => clearInterval(checkPaper);
        } else {
            initializePaper();
        }

        function initializePaper() {
            if (!canvasRef.current) return;
            
            const canvas = canvasRef.current;
            const width = containerSize.width || viewbox.width;
            const height = containerSize.height || viewbox.height;
            
            // Устанавливаем размеры canvas через атрибуты (не CSS!)
            canvas.width = width;
            canvas.height = height;
            
            // Создаем новый scope для Paper.js
            const scope = new paper.PaperScope();
            scope.setup(canvas);
            
            // Устанавливаем начальный масштаб
            scope.activate();
            // Получаем начальный масштаб из store и убеждаемся, что он не меньше минимального
            const state = useEditorStore.getState();
            const minZoom = state.getMinZoom();
            let initialZoom = state.zoom;
            // Убеждаемся, что начальный масштаб не меньше минимального
            if (initialZoom < minZoom) {
                initialZoom = Math.max(minZoom, Math.min(2, minZoom * 2));
                useEditorStore.setState({ zoom: initialZoom });
            }
            const centerPoint = new paper.Point(width / 2, height / 2);
            scope.view.scale(initialZoom, centerPoint);
            
            // Устанавливаем центр view так, чтобы центр сетки был в центре видимой области
            // Центр сетки в координатах проекта: (viewbox.width/2, viewbox.height/2)
            const gridCenterX = viewbox.width / 2;
            const gridCenterY = viewbox.height / 2;
            scope.view.center = new paper.Point(gridCenterX, gridCenterY);
            
            // Сохраняем исходный центр view
            setInitialViewCenter(scope.view.center.clone());
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:101',message:'initial view center saved',data:{initialViewCenter:scope.view.center,viewCenter:scope.view.center,width,height,initialZoom,centerPoint,gridCenterX,gridCenterY},timestamp:Date.now(),sessionId:'debug-session',runId:'reset-view',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            paperScopeRef.current = scope;
            setPaperProject(scope.project);
        }

        // Очистка при размонтировании
        return () => {
            if (paperScopeRef.current) {
                paperScopeRef.current.remove();
            }
        };
    }, []); // Инициализация только один раз

    // Обновление размеров canvas при изменении размеров контейнера
    useEffect(() => {
        if (!canvasRef.current || !paperScopeRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        const width = containerSize.width || viewbox.width;
        const height = containerSize.height || viewbox.height;

        // Обновляем размеры canvas
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            
            // Обновляем размеры view в Paper.js
            const scope = paperScopeRef.current;
            scope.activate();
            scope.view.viewSize = new paper.Size(width, height);
            scope.view.draw();
        }
    }, [containerSize.width, containerSize.height, viewbox.width, viewbox.height]);

    // Обновление масштаба при изменении zoom (только при программном изменении через кнопки)
    // Масштабирование через wheel обрабатывается отдельно с учетом позиции курсора
    useEffect(() => {
        if (!paperScopeRef.current) {
            return;
        }

        const scope = paperScopeRef.current;
        scope.activate();
        const width = containerSize.width || viewbox.width;
        const height = containerSize.height || viewbox.height;
        
        // Проверяем, был ли сброс масштаба (zoom вернулся к начальному значению)
        // Начальное значение - это минимальный масштаб или 2x, в зависимости от того, что больше
        const minZoom = useEditorStore.getState().getMinZoom();
        const initialZoom = Math.max(minZoom, Math.min(2, minZoom * 2));
        const wasReset = prevZoomRef.current !== initialZoom && Math.abs(zoom - initialZoom) < 0.01;
        prevZoomRef.current = zoom;
                
                // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:150',message:'zoom change',data:{zoom,wasReset,prevZoom:prevZoomRef.current,initialViewCenter,currentViewCenter:scope.view.center},timestamp:Date.now(),sessionId:'debug-session',runId:'reset-view',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
        // Вычисляем текущий масштаб view
        const currentScale = scope.view.zoom || 1;
        const scaleFactor = zoom / currentScale;
        const centerPoint = new paper.Point(width / 2, height / 2);
        
        // При программном изменении масштабируем относительно центра canvas
        scope.view.scale(scaleFactor, centerPoint);
        
        // Если был сброс, устанавливаем центр view так, чтобы центр сетки был в центре видимой области
        // Это гарантирует, что сетка будет в центре без пустого пространства
        if (wasReset) {
            // Центр сетки в координатах проекта: (viewbox.width/2, viewbox.height/2)
            const gridCenterX = viewbox.width / 2;
            const gridCenterY = viewbox.height / 2;
            scope.view.center = new paper.Point(gridCenterX, gridCenterY);
                // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:175',message:'view center reset to grid center',data:{wasReset,gridCenterX,gridCenterY,viewCenter:scope.view.center,centerPoint,zoom,currentScale,scaleFactor},timestamp:Date.now(),sessionId:'debug-session',runId:'reset-view',hypothesisId:'E'})}).catch(()=>{});
                                // #endregion
                            }
        
        scope.view.draw();
    }, [zoom, containerSize.width, containerSize.height, viewbox.width, viewbox.height, initialViewCenter]);

    // Обработчик прокрутки колесика мыши для масштабирования относительно позиции курсора
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !paperScopeRef.current) return;

        const handleWheel = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const scope = paperScopeRef.current;
            if (!scope) return;

            scope.activate();

            // Получаем позицию курсора в координатах view (экранные координаты)
            const rect = canvas.getBoundingClientRect();
            const mousePoint = new paper.Point(
                event.clientX - rect.left,
                event.clientY - rect.top
            );

            // Вычисляем точку в координатах проекта (world coordinates)
            const viewPoint = scope.view.viewToProject(mousePoint);

            const delta = event.deltaY;
            const zoomFactor = delta > 0 ? 0.9 : 1.1; // Уменьшение при прокрутке вниз, увеличение при прокрутке вверх
            
            const currentZoom = useEditorStore.getState().zoom;
            const minZoom = useEditorStore.getState().getMinZoom();
            const newZoom = Math.max(minZoom, Math.min(10, currentZoom * zoomFactor));
            
            // Если масштаб не изменился (уже на минимальном или максимальном уровне), не применяем изменения
            if (Math.abs(newZoom - currentZoom) < 0.001) {
                return; // Не изменяем масштаб, если он уже на границе
            }
            
            // Применяем масштабирование относительно позиции курсора
            const scaleFactor = newZoom / currentZoom;
            scope.view.scale(scaleFactor, viewPoint);
            
            // Обновляем zoom в store
            setZoom(newZoom);
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, [setZoom]);

    // Глобальный обработчик для отслеживания средней кнопки мыши
    useEffect(() => {
        const handleGlobalMouseDown = (event) => {
            // Проверяем, что событие происходит на canvas
            const canvas = canvasRef.current;
            if (!canvas) {
                return;
            }
            
            const target = event.target;
            if (target !== canvas && !canvas.contains(target)) {
                return;
            }
            
            // Проверяем, что нажата средняя кнопка мыши (колесико) или зажато колесико
            const isMiddleButton = 
                event.button === 1 || 
                event.buttons === 4 || 
                event.which === 2;
            
            if (isMiddleButton) {
                // Устанавливаем флаг, что средняя кнопка нажата
                isMiddleButtonPressedRef.current = true;
            } else {
                // Сбрасываем флаг для других кнопок
                isMiddleButtonPressedRef.current = false;
            }
        };
        
        // Используем capture phase для установки флага ДО того, как Paper.js обработает событие,
        // но НЕ блокируем событие - пусть оно доходит до Paper.js tool, где мы его заблокируем
        document.addEventListener('mousedown', handleGlobalMouseDown, true);

        return () => {
            document.removeEventListener('mousedown', handleGlobalMouseDown, true);
        };
    }, []);

    // Обработчик перетаскивания view при зажатом колесике мыши
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !paperScopeRef.current) return;

        const scope = paperScopeRef.current;

        const handleMouseDown = (event) => {
            // Проверяем, что нажата средняя кнопка мыши (колесико) или зажато колесико
            const isMiddleButton = 
                event.button === 1 || 
                event.buttons === 4 || 
                event.which === 2;
            
            if (isMiddleButton) {
                // Устанавливаем флаг, что средняя кнопка нажата
                isMiddleButtonPressedRef.current = true;
                
                // НЕ блокируем событие здесь - пусть оно доходит до Paper.js tool,
                // где мы его заблокируем через проверку флага
                
                setIsPanning(true);
                const rect = canvas.getBoundingClientRect();
                setPanStartPoint({
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                    viewCenter: scope.view.center.clone()
                });
            } else {
                // Сбрасываем флаг для других кнопок
                isMiddleButtonPressedRef.current = false;
            }
        };

        const handleMouseMove = (event) => {
            if (!isPanning || !panStartPoint) return;

            event.preventDefault();
            event.stopPropagation();

            scope.activate();
            const rect = canvas.getBoundingClientRect();
            const currentViewPoint = new paper.Point(
                event.clientX - rect.left,
                event.clientY - rect.top
            );
            const startViewPoint = new paper.Point(panStartPoint.x, panStartPoint.y);

            // Вычисляем смещение в экранных координатах (view coordinates)
            const deltaView = currentViewPoint.subtract(startViewPoint);

            // Преобразуем смещение в координаты проекта (world coordinates)
            // Для этого используем текущий масштаб view
            const zoom = scope.view.zoom || 1;
            const deltaProject = deltaView.divide(zoom);

            // Вычисляем новое положение центра view
            const newCenter = panStartPoint.viewCenter.subtract(deltaProject);
            
            // Ограничиваем перемещение границами сетки
            // Границы сетки: от (0, 0) до (viewbox.width, viewbox.height)
            const gridMinX = 0;
            const gridMinY = 0;
            const gridMaxX = viewbox.width;
            const gridMaxY = viewbox.height;
            
            // Размер видимой области в координатах проекта
            const viewWidth = (containerSize.width || viewbox.width) / zoom;
            const viewHeight = (containerSize.height || viewbox.height) / zoom;
            
            // Границы для центра view (чтобы сетка всегда была видна)
            // Левая граница видимой области = center.x - viewWidth/2
            // Правая граница видимой области = center.x + viewWidth/2
            // Верхняя граница видимой области = center.y - viewHeight/2
            // Нижняя граница видимой области = center.y + viewHeight/2
            
            // Если видимая область больше сетки, центр должен быть в центре сетки
            let minCenterX, maxCenterX, minCenterY, maxCenterY;
            if (viewWidth >= gridMaxX) {
                // Видимая область больше или равна сетке по ширине - центр должен быть в центре сетки
                minCenterX = maxCenterX = gridMaxX / 2;
        } else {
                // Видимая область меньше сетки - ограничиваем перемещение
                minCenterX = gridMinX + viewWidth / 2;
                maxCenterX = gridMaxX - viewWidth / 2;
            }
            
            if (viewHeight >= gridMaxY) {
                // Видимая область больше или равна сетке по высоте - центр должен быть в центре сетки
                minCenterY = maxCenterY = gridMaxY / 2;
        } else {
                // Видимая область меньше сетки - ограничиваем перемещение
                minCenterY = gridMinY + viewHeight / 2;
                maxCenterY = gridMaxY - viewHeight / 2;
            }
            
            // Ограничиваем центр view границами
            const clampedCenterX = Math.max(minCenterX, Math.min(maxCenterX, newCenter.x));
            const clampedCenterY = Math.max(minCenterY, Math.min(maxCenterY, newCenter.y));
            
            // Устанавливаем ограниченный центр view
            scope.view.center = new paper.Point(clampedCenterX, clampedCenterY);
            scope.view.draw();
        };

        const handleMouseUp = (event) => {
            if (event.button === 1 || event.buttons === 0) {
                setIsPanning(false);
                setPanStartPoint(null);
                // Сбрасываем флаг средней кнопки мыши
                isMiddleButtonPressedRef.current = false;
            }
        };

        const handleContextMenu = (event) => {
            // Предотвращаем контекстное меню при зажатом колесике
            if (event.button === 1) {
                event.preventDefault();
            }
        };

        // НЕ используем capture phase - пусть Paper.js обработает событие первым,
        // а мы только установим флаг для последующей проверки в tool.onMouseDown
        canvas.addEventListener('mousedown', handleMouseDown, false); // false = bubble phase
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        canvas.addEventListener('contextmenu', handleContextMenu);

        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown, false); // false = bubble phase
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseUp);
            canvas.removeEventListener('contextmenu', handleContextMenu);
        };
    }, [isPanning, panStartPoint]);

    // Отрисовка элементов на canvas
    useEffect(() => {
        if (!paperProject || !paperScopeRef.current) {
            return;
        }

        const scope = paperScopeRef.current;
        scope.activate();
        
        // Очищаем canvas
        scope.project.clear();

        // Отрисовываем сетку
        if (grid.visible) {
            drawGrid(scope, gridStepPixels, false);
        }

        // Находим все fillet для проверки выделения линий
        const fillets = elements.filter(el => el.type === 'fillet');
        const lineIdsInSelectedFillets = new Set();
        selectedElements.forEach(sel => {
            if (sel.type === 'fillet') {
                if (sel.line1Id) lineIdsInSelectedFillets.add(sel.line1Id);
                if (sel.line2Id) lineIdsInSelectedFillets.add(sel.line2Id);
            }
        });
        
        // Присваиваем номера концам линий для визуализации
        const pointNumberMap = assignPointNumbers(elements);
        
        // Отрисовываем элементы
        elements.forEach((element) => {
            const isSelected = selectedElements.some(sel => sel.id === element.id);
            
            if (element.type === 'line') {
                // Если линия входит в выбранный fillet, выделяем её
                const shouldHighlight = lineIdsInSelectedFillets.has(element.id);
                drawLine(scope, element, isSelected || shouldHighlight, false, null, pointNumberMap);
            } else if (element.type === 'arc') {
                drawArc(scope, element, isSelected);
            } else if (element.type === 'fillet') {
                drawFillet(scope, element, isSelected, elements, pointNumberMap);
            } else if (element.type === 'chamfer') {
                drawChamfer(scope, element, isSelected, elements, pointNumberMap);
            }
        });

        // В режиме "Скругление" или "Фаска" отображаем все точки соединений между линиями
        // Отрисовываем ПОСЛЕ всех элементов, чтобы точки были видны поверх
        if (selectedTool === 'arc' || selectedTool === 'chamfer') {
            const connectionPoints = findAllConnectionPoints(elements);
            connectionPoints.forEach((cp, index) => {
                // Создаем круг для точки соединения
                const circle = new paper.Path.Circle({
                    center: [cp.point.x, cp.point.y],
                    radius: 1.6,
                    fillColor: '#ff6600',
                    strokeColor: '#fff',
                    strokeWidth: 2,
                });
                circle.data = { type: 'connectionPoint', connectionPoint: cp, index };
                // Перемещаем на передний план, чтобы точка была видна
                circle.bringToFront();
            });
        }

        // Временная линия будет отрисовываться в обработчике onMouseMove
        // Здесь не отрисовываем её, чтобы избежать ошибок при отсутствии события

        scope.view.draw();
    }, [elements, selectedElements, grid, dimensionsVisible, debugNumbersVisible, paperProject, gridStepPixels, selectedTool]);

    // Обработка событий мыши
    useEffect(() => {
        if (!paperProject || !paperScopeRef.current) {
            return;
        }

        const scope = paperScopeRef.current;
        scope.activate();

        const tool = new paper.Tool();
        
        tool.onMouseDown = (event) => {
            // Проверяем, что нажата средняя кнопка мыши (колесико) - блокируем обработку
            // Проверяем все возможные способы определения средней кнопки
            const checkMiddleButton = (evt) => {
                if (!evt) return false;
                return evt.button === 1 || evt.buttons === 4 || evt.which === 2;
            };
            
            const nativeEvent = event.event || event.originalEvent;
            const isMiddleButton = 
                checkMiddleButton(nativeEvent) ||
                checkMiddleButton(window.event) ||
                isMiddleButtonPressedRef.current;
            
            if (isMiddleButton) {
                return; // Выходим немедленно, не обрабатываем событие
            }
            
            const point = { x: event.point.x, y: event.point.y };
            let snappedPoint = snapToGrid(point, gridStepPixels);

            if (selectedTool === 'line') {
                if (!currentLineStart) {
                    setCurrentLineStart(snappedPoint);
                    setIsDrawing(true);
                } else {
                    const endPoint = orthogonalSnap ? snapToOrthogonal(currentLineStart, snappedPoint) : snappedPoint;
                    const finalEndPoint = snapToGrid(endPoint, gridStepPixels);
                    
                    addElement({
                        type: 'line',
                        start: currentLineStart,
                        end: finalEndPoint,
                        length: distance(currentLineStart, finalEndPoint),
                    });
                    
                    setCurrentLineStart(finalEndPoint);
                    setIsDrawing(true);
                }
            } else if (selectedTool === 'select') {
                // Сначала проверяем, кликнули ли на точку выбранной линии
                let clickedPointInfo = null;
                for (const selectedEl of selectedElements) {
                    if (selectedEl.type === 'line') {
                        const distToStart = distance(point, selectedEl.start);
                        const distToEnd = distance(point, selectedEl.end);
                        const pointThreshold = 8; // Радиус клика на точку
                        
                        if (distToStart < pointThreshold) {
                            clickedPointInfo = { elementId: selectedEl.id, pointType: 'start', point: selectedEl.start };
                            break;
                        } else if (distToEnd < pointThreshold) {
                            clickedPointInfo = { elementId: selectedEl.id, pointType: 'end', point: selectedEl.end };
                            break;
                        }
                    }
                }
                
                if (clickedPointInfo) {
                    // Находим все связанные точки
                    const connectedPoints = findConnectedPoints(
                        clickedPointInfo.elementId,
                        clickedPointInfo.pointType,
                        clickedPointInfo.point,
                        elements,
                        selectedElements
                    );
                    // Начинаем перетаскивание всех связанных точек
                    setDraggingPoint(connectedPoints);
                } else {
                    // Проверяем, кликнули ли на элемент
                    // Сначала проверяем fillet (чтобы при клике на дугу выбирался fillet, а не линия)
                    let clickedElement = elements.find(el => {
                        if (el.type === 'fillet') {
                            // Проверяем, находится ли точка на дуге fillet
                            const distToArcCenter = distance(point, el.arc.center);
                            const onArc = Math.abs(distToArcCenter - el.arc.radius) < 10;
                            return onArc;
                        }
                        return false;
                    });
                    
                    // Если fillet не выбран, проверяем другие элементы
                    if (!clickedElement) {
                        clickedElement = elements.find(el => {
                            if (el.type === 'line') {
                                return isPointOnLine(point, el.start, el.end, 10);
                            }
                            if (el.type === 'arc') {
                                const dist = distance(point, el.center);
                                return Math.abs(dist - el.radius) < 10;
                            }
                            return false;
                        });
                    }
                    
                    if (clickedElement) {
                        selectElement(clickedElement, true);
                    } else {
                        selectElement(null);
                    }
                }
            } else if (selectedTool === 'delete') {
                const clickedElement = elements.find(el => {
                    if (el.type === 'line') {
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    if (el.type === 'arc') {
                        const dist = distance(point, el.center);
                        return Math.abs(dist - el.radius) < 10;
                    }
                    if (el.type === 'fillet') {
                        // Проверяем, находится ли точка на дуге fillet
                        const distToArcCenter = distance(point, el.arc.center);
                        const onArc = Math.abs(distToArcCenter - el.arc.radius) < 10;
                        // Также проверяем линии, входящие в fillet
                        const line1 = elements.find(l => l.id === el.line1Id);
                        const line2 = elements.find(l => l.id === el.line2Id);
                        const onLine1 = line1 && line1.type === 'line' ? isPointOnLine(point, line1.start, line1.end, 10) : false;
                        const onLine2 = line2 && line2.type === 'line' ? isPointOnLine(point, line2.start, line2.end, 10) : false;
                        return onLine1 || onLine2 || onArc;
                    }
                    if (el.type === 'chamfer') {
                        // Проверяем, находится ли точка на линии chamfer
                        const onChamfer = isPointOnLine(point, el.start, el.end, 10);
                        // Также проверяем линии, входящие в chamfer
                        const line1 = elements.find(l => l.id === el.line1Id);
                        const line2 = elements.find(l => l.id === el.line2Id);
                        const onLine1 = line1 && line1.type === 'line' ? isPointOnLine(point, line1.start, line1.end, 10) : false;
                        const onLine2 = line2 && line2.type === 'line' ? isPointOnLine(point, line2.start, line2.end, 10) : false;
                        return onLine1 || onLine2 || onChamfer;
                    }
                    return false;
                });
                
                if (clickedElement) {
                    deleteElement(clickedElement.id);
                } else if (selectedElements.length > 0) {
                    deleteSelectedElements();
                }
            } else if (selectedTool === 'arc' || selectedTool === 'chamfer') {
                // В режиме arc можно редактировать только радиусы (fillet и arc элементы)
                // В режиме chamfer можно редактировать только фаски (chamfer элементы)
                // При клике на точку соединения создается радиус/фаска между двумя линиями
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:320',message:'arc mode click',data:{point:{x:point.x,y:point.y}},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                
                // Сначала проверяем, кликнули ли на fillet, arc или chamfer элемент для редактирования
                const clickedFillet = elements.find(el => {
                    if (el.type === 'fillet') {
                        // Проверяем, находится ли точка на дуге fillet
                        const distToArcCenter = distance(point, el.arc.center);
                        return Math.abs(distToArcCenter - el.arc.radius) < 10;
                    }
                    return false;
                });
                
                const clickedArc = elements.find(el => {
                    if (el.type === 'arc') {
                        const dist = distance(point, el.center);
                        return Math.abs(dist - el.radius) < 10;
                    }
                    return false;
                });
                
                const clickedChamfer = elements.find(el => {
                    if (el.type === 'chamfer') {
                        // Проверяем, находится ли точка на линии chamfer
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    return false;
                });
                
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:342',message:'fillet/arc check',data:{clickedFillet:!!clickedFillet,clickedArc:!!clickedArc},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                
                if (clickedFillet) {
                    // Выбираем fillet элемент для редактирования
                    selectElement(clickedFillet);
                } else if (clickedArc) {
                    // Выбираем arc элемент для редактирования
                    selectElement(clickedArc);
                } else if (clickedChamfer) {
                    // Выбираем chamfer элемент для редактирования
                    selectElement(clickedChamfer);
                } else {
                    // Проверяем клик на точку соединения
                    const connectionPoints = findAllConnectionPoints(elements);
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:349',message:'checking connection points',data:{connectionPointsCount:connectionPoints.length,connectionPoints:connectionPoints.map(cp=>({point:{x:cp.point.x,y:cp.point.y},line1Id:cp.line1.id,line2Id:cp.line2.id}))},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    const clickedConnection = connectionPoints.find(cp => {
                        const dist = distance(point, cp.point);
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:352',message:'distance check',data:{clickPoint:{x:point.x,y:point.y},cpPoint:{x:cp.point.x,y:cp.point.y},dist,threshold:10,withinRange:dist<10},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'A'})}).catch(()=>{});
                        // #endregion
                        return dist < 10; // Радиус клика на точку соединения
                    });
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:356',message:'connection point click result',data:{clickedConnection:!!clickedConnection,clickedConnectionData:clickedConnection?{point:{x:clickedConnection.point.x,y:clickedConnection.point.y},line1Id:clickedConnection.line1.id,line2Id:clickedConnection.line2.id}:null},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    
                    if (clickedConnection) {
                        // Кликнули на точку соединения - создаем радиус между двумя линиями
                        const currentState = useEditorStore.getState();
                        const line1FromStore = currentState.elements.find(el => el.id === clickedConnection.line1.id);
                        const line2FromStore = currentState.elements.find(el => el.id === clickedConnection.line2.id);
                        
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:362',message:'before createFilletAtCorner',data:{line1FromStore:!!line1FromStore,line2FromStore:!!line2FromStore,line1Id:clickedConnection.line1.id,line2Id:clickedConnection.line2.id},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'B'})}).catch(()=>{});
                        // #endregion
                        
                        if (line1FromStore && line2FromStore && line1FromStore.type === 'line' && line2FromStore.type === 'line') {
                            if (selectedTool === 'arc') {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:363',message:'calling createFilletAtCorner',data:{line1Id:line1FromStore.id,line2Id:line2FromStore.id},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'B'})}).catch(()=>{});
                                // #endregion
                                try {
                                    createFilletAtCorner(line1FromStore, line2FromStore);
                                    // #region agent log
                                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:363',message:'createFilletAtCorner completed',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'B'})}).catch(()=>{});
                                    // #endregion
                                } catch (error) {
                                    // #region agent log
                                    fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:363',message:'createFilletAtCorner error',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'click-debug',hypothesisId:'B'})}).catch(()=>{});
                                    // #endregion
                                }
                            } else if (selectedTool === 'chamfer') {
                                try {
                                    createChamferAtCorner(line1FromStore, line2FromStore);
                                } catch (error) {
                                    console.error('Error creating chamfer:', error);
                                }
                            }
                            selectElement(null);
                        }
                    } else {
                        // Клик не на радиус и не на точку соединения - снимаем выделение
                        selectElement(null);
                    }
                }
            }
        };

        tool.onMouseMove = (event) => {
            // Получаем текущую позицию мыши и привязываем к сетке
            const point = { x: event.point.x, y: event.point.y };
            const snappedPoint = snapToGrid(point, gridStepPixels);
            
            // Определяем элемент под курсором в режиме select/edit
            let hoveredElement = null;
            let hoveredPointInfo = null;
            if (selectedTool === 'select') {
                // Сначала проверяем, находится ли курсор над точкой выбранной линии
                for (const selectedEl of selectedElements) {
                    if (selectedEl.type === 'line') {
                        const distToStart = distance(point, selectedEl.start);
                        const distToEnd = distance(point, selectedEl.end);
                        const pointThreshold = 8;
                        
                        if (distToStart < pointThreshold) {
                            hoveredPointInfo = { elementId: selectedEl.id, pointType: 'start' };
                            // Меняем курсор на pointer
                            if (canvasRef.current) {
                                canvasRef.current.style.cursor = 'pointer';
                            }
                            break;
                        } else if (distToEnd < pointThreshold) {
                            hoveredPointInfo = { elementId: selectedEl.id, pointType: 'end' };
                            // Меняем курсор на pointer
                            if (canvasRef.current) {
                                canvasRef.current.style.cursor = 'pointer';
                            }
                            break;
                        }
                    }
                }
                
                // Если не над точкой, проверяем элементы
                if (!hoveredPointInfo) {
                    hoveredElement = elements.find(el => {
                        if (el.type === 'line') {
                            return isPointOnLine(point, el.start, el.end, 10);
                        }
                        if (el.type === 'arc') {
                            const dist = distance(point, el.center);
                            return Math.abs(dist - el.radius) < 10;
                        }
                        if (el.type === 'fillet') {
                            // Проверяем, находится ли точка на дуге fillet
                            const distToArcCenter = distance(point, el.arc.center);
                            const onArc = Math.abs(distToArcCenter - el.arc.radius) < 10;
                            // Также проверяем линии, входящие в fillet
                            const line1 = elements.find(l => l.id === el.line1Id);
                            const line2 = elements.find(l => l.id === el.line2Id);
                            const onLine1 = line1 && line1.type === 'line' ? isPointOnLine(point, line1.start, line1.end, 10) : false;
                            const onLine2 = line2 && line2.type === 'line' ? isPointOnLine(point, line2.start, line2.end, 10) : false;
                            return onLine1 || onLine2 || onArc;
                        }
                        return false;
                    });
                    
                    // Возвращаем курсор к default, если не над точкой
                    if (canvasRef.current && !hoveredElement) {
                        canvasRef.current.style.cursor = 'default';
                    }
                }
            } else if (selectedTool === 'arc') {
                // В режиме arc подсвечиваем только радиусы (fillet и arc элементы) для редактирования
                // Точки соединений отображаются и подсвечиваются отдельно
                hoveredElement = elements.find(el => {
                    if (el.type === 'fillet') {
                        // Проверяем, находится ли точка на дуге fillet
                        const distToArcCenter = distance(point, el.arc.center);
                        return Math.abs(distToArcCenter - el.arc.radius) < 10;
                    }
                    if (el.type === 'arc') {
                        const dist = distance(point, el.center);
                        return Math.abs(dist - el.radius) < 10;
                    }
                    return false;
                });
            } else if (selectedTool === 'chamfer') {
                // В режиме chamfer подсвечиваем только фаски (chamfer элементы) для редактирования
                // Точки соединений отображаются и подсвечиваются отдельно
                hoveredElement = elements.find(el => {
                    if (el.type === 'chamfer') {
                        // Проверяем, находится ли точка на линии chamfer
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    return false;
                });
            } else if (selectedTool === 'delete') {
                // В режиме delete находим элемент под курсором для подсветки красным
                hoveredElement = elements.find(el => {
                    if (el.type === 'line') {
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    if (el.type === 'arc') {
                        const dist = distance(point, el.center);
                        return Math.abs(dist - el.radius) < 10;
                    }
                    if (el.type === 'fillet') {
                        // Проверяем, находится ли точка на дуге fillet
                        const distToArcCenter = distance(point, el.arc.center);
                        const onArc = Math.abs(distToArcCenter - el.arc.radius) < 10;
                        // Также проверяем линии, входящие в fillet
                        const line1 = elements.find(l => l.id === el.line1Id);
                        const line2 = elements.find(l => l.id === el.line2Id);
                        const onLine1 = line1 && line1.type === 'line' ? isPointOnLine(point, line1.start, line1.end, 10) : false;
                        const onLine2 = line2 && line2.type === 'line' ? isPointOnLine(point, line2.start, line2.end, 10) : false;
                        return onLine1 || onLine2 || onArc;
                    }
                    if (el.type === 'chamfer') {
                        // Проверяем, находится ли точка на линии chamfer
                        const onChamfer = isPointOnLine(point, el.start, el.end, 10);
                        // Также проверяем линии, входящие в chamfer
                        const line1 = elements.find(l => l.id === el.line1Id);
                        const line2 = elements.find(l => l.id === el.line2Id);
                        const onLine1 = line1 && line1.type === 'line' ? isPointOnLine(point, line1.start, line1.end, 10) : false;
                        const onLine2 = line2 && line2.type === 'line' ? isPointOnLine(point, line2.start, line2.end, 10) : false;
                        return onLine1 || onLine2 || onChamfer;
                    }
                    return false;
                });
                
                // Меняем курсор на "not-allowed" (терка) если элемент найден
                if (canvasRef.current) {
                    canvasRef.current.style.cursor = hoveredElement ? 'not-allowed' : 'default';
                }
            }
            
            setHoveredPoint(hoveredPointInfo);
            
            // Перерисовываем canvas
            scope.project.clear();
            
            // Отрисовываем сетку
            if (grid.visible) {
                drawGrid(scope, gridStepPixels, false);
            }
            
            // Находим все fillet для проверки выделения линий
            const fillets = elements.filter(el => el.type === 'fillet');
            const lineIdsInSelectedFillets = new Set();
            selectedElements.forEach(sel => {
                if (sel.type === 'fillet') {
                    if (sel.line1Id) lineIdsInSelectedFillets.add(sel.line1Id);
                    if (sel.line2Id) lineIdsInSelectedFillets.add(sel.line2Id);
                }
            });
            
            // Присваиваем номера концам линий для визуализации
            const pointNumberMap = assignPointNumbers(elements);
            
            // Отрисовываем элементы
            elements.forEach((element) => {
                const isSelected = selectedElements.some(sel => sel.id === element.id);
                const isHovered = hoveredElement && hoveredElement.id === element.id;
                const isDeleteHovered = selectedTool === 'delete' && isHovered;
                
                if (element.type === 'line') {
                    // Если линия входит в выбранный fillet, выделяем её
                    const shouldHighlight = lineIdsInSelectedFillets.has(element.id);
                    drawLine(scope, element, isSelected || shouldHighlight, isHovered && selectedTool !== 'delete', hoveredPointInfo, pointNumberMap, isDeleteHovered);
                } else if (element.type === 'arc') {
                    drawArc(scope, element, isSelected, isHovered && selectedTool !== 'delete', isDeleteHovered);
                } else if (element.type === 'fillet') {
                    drawFillet(scope, element, isSelected || (hoveredElement && hoveredElement.id === element.id && selectedTool !== 'delete'), elements, pointNumberMap, isDeleteHovered);
                }
            });
            
            // В режиме "Скругление" или "Фаска" отображаем все точки соединений между линиями
            if (selectedTool === 'arc' || selectedTool === 'chamfer') {
                const connectionPoints = findAllConnectionPoints(elements);
                connectionPoints.forEach((cp, index) => {
                    const circle = new paper.Path.Circle({
                        center: [cp.point.x, cp.point.y],
                        radius: 2.6,
                        fillColor: '#ff6600',
                        strokeColor: '#fff',
                        strokeWidth: 2,
                    });
                    circle.data = { type: 'connectionPoint', connectionPoint: cp, index };
                    // Перемещаем на передний план, чтобы точка была видна
                    circle.bringToFront();
                });
            }
            
            // Точка-курсор отображается в режиме рисования линий
            if (selectedTool === 'line') {
                let displayPoint = snappedPoint;
                
                // Если уже есть начальная точка - показываем точку с учетом ортогональной привязки
                if (currentLineStart) {
                    setIsDrawing(true);
                    const endPoint = orthogonalSnap ? snapToOrthogonal(currentLineStart, snappedPoint) : snappedPoint;
                    displayPoint = snapToGrid(endPoint, gridStepPixels);
                    
                    const tempLine = new paper.Path.Line({
                        from: [currentLineStart.x, currentLineStart.y],
                        to: [displayPoint.x, displayPoint.y],
                        strokeColor: '#999',
                        strokeWidth: 2,
                    });
                    
                    const length = distance(currentLineStart, displayPoint);
                    const lengthText = formatLengthMM(length);
                    const midX = (currentLineStart.x + displayPoint.x) / 2;
                    const midY = (currentLineStart.y + displayPoint.y) / 2;
                    
                    // Используем тот же формат и стиль, что и финальная сноска
                    const leaderLength = 15;
                    const horizontalLength = 40;
                    const angle = 45;
                    const angleRad = (angle * Math.PI) / 180;
                    
                    const leaderStartX = midX;
                    const leaderStartY = midY;
                    const leaderEndX = midX + Math.cos(angleRad) * leaderLength;
                    const leaderEndY = midY - Math.sin(angleRad) * leaderLength;
                    
                    const horizontalStartX = leaderEndX;
                    const horizontalStartY = leaderEndY;
                    const horizontalEndX = leaderEndX + horizontalLength;
                    const horizontalEndY = leaderEndY;
                    
                    const textY = horizontalStartY - 3;
                    
                    const strokeColor = '#999'; // Тот же цвет, что и для невыбранных элементов
                    const lineWidth = 0.5;
                    
                    // Определяем, является ли линия вертикальной
                    const isVertical = Math.abs(currentLineStart.x - displayPoint.x) < 0.1;
                    
                    // Косая линия (как в финальной сноске)
                    const tempLeaderLine = new paper.Path.Line({
                        from: [leaderStartX, leaderStartY],
                        to: [leaderEndX, leaderEndY],
                        strokeColor: strokeColor,
                        strokeWidth: lineWidth,
                    });
                    
                    // Горизонтальная линия (как в финальной сноске)
                    const tempHorizontalLine = new paper.Path.Line({
                        from: [horizontalStartX, horizontalStartY],
                        to: [horizontalEndX, horizontalEndY],
                        strokeColor: strokeColor,
                        strokeWidth: lineWidth,
                    });
                    
                    // Создаем текст временно для получения его ширины
                    const tempTextForBounds = new paper.PointText({
                        point: [0, 0],
                        content: lengthText,
                        fillColor: strokeColor,
                        fontSize: 11,
                    });
                    const textWidth = tempTextForBounds.bounds.width;
                    tempTextForBounds.remove(); // Удаляем временный текст
                    
                    // Выравниваем текст по правому краю сноски (horizontalEndX)
                    const tempTextX = horizontalEndX - textWidth;
                    // Для всех линий используем textY, чтобы текст был над сноской
                    
                    // Текст (как в финальной сноске) - выровнен по правому краю сноски
                    const tempText = new paper.PointText({
                        point: [tempTextX, textY],
                        content: lengthText,
                        fillColor: strokeColor,
                        fontSize: 11,
                    });
                }
                
                // Отрисовываем точку-курсор с привязкой к сетке
                const cursorPoint = new paper.Path.Circle({
                    center: [displayPoint.x, displayPoint.y],
                    radius: 2.6, // Увеличено в два раза (было 1.3)
                    fillColor: '#0066cc',
                    strokeColor: '#ffffff',
                    strokeWidth: 0.5,
                });
            }
            
            scope.view.draw();
        };

        tool.onMouseDrag = (event) => {
            // Получаем актуальное состояние из store
            const currentState = useEditorStore.getState();
            if (draggingPoint && Array.isArray(draggingPoint) && draggingPoint.length > 0 && currentState.selectedTool === 'select') {
                const point = { x: event.point.x, y: event.point.y };
                
                // Обрабатываем первую точку для определения нового положения
                const firstPoint = draggingPoint[0];
                const firstElement = currentState.elements.find(el => el.id === firstPoint.elementId);
                
                if (firstElement && firstElement.type === 'line') {
                    let finalPoint;
                    
                    if (draggingPoint.length === 1) {
                        // Если только одна точка - ограничиваем движение по линии
                        const dx = firstElement.end.x - firstElement.start.x;
                        const dy = firstElement.end.y - firstElement.start.y;
                        const lineLength = Math.sqrt(dx * dx + dy * dy);
                        
                        if (lineLength > 0) {
                            // Нормализованный вектор направления
                            const dirX = dx / lineLength;
                            const dirY = dy / lineLength;
                            
                            // Проецируем точку на линию
                            let basePoint = firstPoint.pointType === 'start' ? firstElement.start : firstElement.end;
                            const toPoint = { x: point.x - basePoint.x, y: point.y - basePoint.y };
                            const projection = toPoint.x * dirX + toPoint.y * dirY;
                            const newPoint = {
                                x: basePoint.x + projection * dirX,
                                y: basePoint.y + projection * dirY
                            };
                            
                            // Привязываем к сетке
                            finalPoint = snapToGrid(newPoint, gridStepPixels);
                        } else {
                            finalPoint = snapToGrid(point, gridStepPixels);
                        }
                    } else {
                        // Если несколько точек - свободное движение
                        finalPoint = snapToGrid(point, gridStepPixels);
                    }
                    
                    // Обновляем все связанные точки
                    draggingPoint.forEach((pointInfo) => {
                        const element = currentState.elements.find(el => el.id === pointInfo.elementId);
                        if (element && element.type === 'line') {
                            if (pointInfo.pointType === 'start') {
                                currentState.updateElement(element.id, {
                                    start: finalPoint,
                                    length: distance(finalPoint, element.end)
                                });
                            } else {
                                currentState.updateElement(element.id, {
                                    end: finalPoint,
                                    length: distance(element.start, finalPoint)
                                });
                            }
                        }
                    });
                    
                        // Получаем актуальное состояние после обновления и перерисовываем canvas
                        const updatedState = useEditorStore.getState();
                        scope.project.clear();
                        if (updatedState.grid.visible) {
                            drawGrid(scope, gridStepPixels, false);
                        }
                        
                        // Находим fillet для выделения линий
                        const fillets = updatedState.elements.filter(e => e.type === 'fillet');
                        const lineIdsInSelectedFillets = new Set();
                        updatedState.selectedElements.forEach(sel => {
                            if (sel.type === 'fillet') {
                                if (sel.line1Id) lineIdsInSelectedFillets.add(sel.line1Id);
                                if (sel.line2Id) lineIdsInSelectedFillets.add(sel.line2Id);
                            }
                        });
                        
                        const pointNumberMap = assignPointNumbers(updatedState.elements);
                        
                        updatedState.elements.forEach((el) => {
                            const isSelected = updatedState.selectedElements.some(sel => sel.id === el.id);
                            if (el.type === 'line') {
                                const shouldHighlight = lineIdsInSelectedFillets.has(el.id);
                                drawLine(scope, el, isSelected || shouldHighlight, false, null, pointNumberMap);
                            } else if (el.type === 'arc') {
                                drawArc(scope, el, isSelected, false);
                            } else if (el.type === 'fillet') {
                                drawFillet(scope, el, isSelected, updatedState.elements, pointNumberMap);
                            } else if (el.type === 'chamfer') {
                                drawChamfer(scope, el, isSelected, updatedState.elements, pointNumberMap);
                            }
                        });
                        scope.view.draw();
                }
            }
        };

        tool.onMouseUp = (event) => {
            setDraggingPoint((currentDragging) => {
                if (currentDragging) {
                    return null;
                }
                return currentDragging;
            });
        };

        tool.activate();
        tool.activate();

        return () => {
            tool.remove();
        };
    }, [selectedTool, currentLineStart, isDrawing, elements, selectedElements, gridStepPixels, paperProject, grid, dimensionsVisible, debugNumbersVisible, orthogonalSnap, addElement, selectElement, deleteElement, deleteSelectedElements, setIsDrawing, setCurrentLineStart, draggingPoint, updateElement, hoveredPoint]);

    // Обработка клавиши Escape для отмены рисования
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isDrawing) {
                setCurrentLineStart(null);
                setIsDrawing(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDrawing]);

    // Обработка выхода мыши из области canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleMouseLeave = () => {
            setHoveredPoint(null);
            canvas.style.cursor = 'default';
        };

        canvas.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            canvas.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    // Функции отрисовки
    const drawGrid = (scope, stepPixels, showMajorLines) => {
        const view = scope.view;
        // Используем фактические размеры view или размеры контейнера
        const width = view.viewSize.width || containerSize.width || viewbox.width;
        const height = view.viewSize.height || containerSize.height || viewbox.height;

        const gridLayer = new paper.Layer();
        gridLayer.name = 'grid';

        // Обычные линии сетки
        for (let x = 0; x <= width; x += stepPixels) {
            const line = new paper.Path.Line({
                from: [x, 0],
                to: [x, height],
                strokeColor: '#e0e0e0',
                strokeWidth: 0.5,
            });
            gridLayer.addChild(line);
        }

        for (let y = 0; y <= height; y += stepPixels) {
            const line = new paper.Path.Line({
                from: [0, y],
                to: [width, y],
                strokeColor: '#e0e0e0',
                strokeWidth: 0.5,
            });
            gridLayer.addChild(line);
        }

        // Темные линии через 10 мм
        if (showMajorLines) {
            const majorStepPixels = mmToPixels(10);
            for (let x = 0; x <= width; x += majorStepPixels) {
                const line = new paper.Path.Line({
                    from: [x, 0],
                    to: [x, height],
                    strokeColor: '#999',
                    strokeWidth: 1,
                });
                gridLayer.addChild(line);
            }

            for (let y = 0; y <= height; y += majorStepPixels) {
                const line = new paper.Path.Line({
                    from: [0, y],
                    to: [width, y],
                    strokeColor: '#999',
                    strokeWidth: 1,
                });
                gridLayer.addChild(line);
            }
        }

        gridLayer.locked = true;
    };

    // Функция для поиска всех точек, связанных с указанной точкой элемента
    const findConnectedPoints = (elementId, pointType, point, allElements, selectedElements, tolerance = 1) => {
        const connectedPoints = [{ elementId, pointType }];
        const clickedElement = allElements.find(el => el.id === elementId);
        if (!clickedElement || clickedElement.type !== 'line') return connectedPoints;

        const clickedPoint = clickedElement[pointType]; // Используем точку из элемента

        // Ищем другие выбранные элементы с общей точкой
        for (const selectedEl of selectedElements) {
            if (selectedEl.id === elementId || selectedEl.type !== 'line') continue;

            // Проверяем начало линии
            if (distance(clickedPoint, selectedEl.start) < tolerance) {
                // Проверяем, не добавили ли мы уже эту точку
                const alreadyAdded = connectedPoints.some(
                    p => p.elementId === selectedEl.id && p.pointType === 'start'
                );
                if (!alreadyAdded) {
                    connectedPoints.push({ elementId: selectedEl.id, pointType: 'start' });
                }
            }
            // Проверяем конец линии
            if (distance(clickedPoint, selectedEl.end) < tolerance) {
                // Проверяем, не добавили ли мы уже эту точку
                const alreadyAdded = connectedPoints.some(
                    p => p.elementId === selectedEl.id && p.pointType === 'end'
                );
                if (!alreadyAdded) {
                    connectedPoints.push({ elementId: selectedEl.id, pointType: 'end' });
                }
            }
        }

        return connectedPoints;
    };

    // Функция для поиска всех точек соединений между линиями
    const findAllConnectionPoints = (allElements) => {
        console.log('=== findAllConnectionPoints CALLED ===');
        const connectionPoints = [];
        const lineElements = allElements.filter(el => el.type === 'line');
        const tolerance = 10;
        
        console.log('findAllConnectionPoints: looking for connections between', lineElements.length, 'lines');
        
        // Для каждой пары линий проверяем, соединяются ли они
        for (let i = 0; i < lineElements.length; i++) {
            for (let j = i + 1; j < lineElements.length; j++) {
                const line1 = lineElements[i];
                const line2 = lineElements[j];
                
                // Проверяем, не существует ли уже радиус для этой пары
                const existingFillet = allElements.find(el => 
                    el.type === 'fillet' && 
                    ((el.line1Id === line1.id && el.line2Id === line2.id) ||
                     (el.line1Id === line2.id && el.line2Id === line1.id))
                );
                
                if (existingFillet) continue; // Пропускаем, если радиус уже существует
                
                const connection = findConnectionPoint(line1, line2, tolerance);
                console.log('Checking connection between lines', line1.id, 'and', line2.id, ':', connection);
                if (connection) {
                    console.log('Connection found!', connection);
                    connectionPoints.push({
                        point: connection,
                        line1: line1,
                        line2: line2,
                    });
                }
            }
        }
        
        console.log('findAllConnectionPoints: found', connectionPoints.length, 'connection points');
        return connectionPoints;
    };

    // Функция для присвоения номеров концам линий
    const assignPointNumbers = (allElements) => {
        const pointNumberMap = new Map(); // Map: "elementId:start" -> number, "elementId:end" -> number
        let nextNumber = 1;
        const tolerance = 10;

        // Для каждой линии присваиваем номера концам
        const lineElements = allElements.filter(el => el.type === 'line');
        
        // Для каждой линии создаем две точки
        const points = [];
        lineElements.forEach(line => {
            points.push({ elementId: line.id, pointType: 'start', point: line.start, line });
            points.push({ elementId: line.id, pointType: 'end', point: line.end, line });
        });

        // Находим соединенные точки (с одинаковыми координатами) и присваиваем им одинаковые номера
        for (let i = 0; i < points.length; i++) {
            const key = `${points[i].elementId}:${points[i].pointType}`;
            if (pointNumberMap.has(key)) continue; // Уже присвоен номер

            // Ищем все точки, которые совпадают с этой точкой
            const connectedPoints = [points[i]];
            for (let j = i + 1; j < points.length; j++) {
                const dist = distance(points[i].point, points[j].point);
                if (dist < tolerance) {
                    connectedPoints.push(points[j]);
                }
            }

            // Всем соединенным точкам присваиваем одинаковый номер
            const number = nextNumber++;
            connectedPoints.forEach(p => {
                const pKey = `${p.elementId}:${p.pointType}`;
                pointNumberMap.set(pKey, number);
            });
        }

        return pointNumberMap;
    };

    const drawLine = (scope, element, isSelected, isHovered = false, hoveredPointInfo = null, pointNumberMap = null, isDeleteHovered = false) => {
        // Приоритет: delete hovered (red) > selected > hovered > обычный
        let strokeColor = '#000';
        let strokeWidth = 2;
        
        if (isDeleteHovered) {
            strokeColor = '#ff0000';
            strokeWidth = 3;
        } else if (isSelected) {
            strokeColor = '#0073aa';
            strokeWidth = 3;
        } else if (isHovered) {
            strokeColor = '#0073aa';
            strokeWidth = 2;
        }
        
        const line = new paper.Path.Line({
            from: [element.start.x, element.start.y],
            to: [element.end.x, element.end.y],
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
        });

        line.data = { elementId: element.id, type: 'line' };

        // Отрисовка точек на концах для выбранных линий
        if (isSelected && element.type === 'line') {
            const pointRadius = 2.6; // Такой же размер, как у точки-курсора при рисовании
            
            // Проверяем, находится ли курсор над начальной точкой
            const isStartHovered = hoveredPointInfo && 
                hoveredPointInfo.elementId === element.id && 
                hoveredPointInfo.pointType === 'start';
            
            // Проверяем, находится ли курсор над конечной точкой
            const isEndHovered = hoveredPointInfo && 
                hoveredPointInfo.elementId === element.id && 
                hoveredPointInfo.pointType === 'end';
            
            // Точка на начале линии (с изменением цвета при hover)
            const startPoint = new paper.Path.Circle({
                center: [element.start.x, element.start.y],
                radius: pointRadius,
                fillColor: isStartHovered ? '#ff8800' : '#0073aa', // Оранжевый при hover
                strokeColor: '#fff',
                strokeWidth: 2,
            });
            startPoint.data = { elementId: element.id, pointType: 'start', type: 'linePoint' };
            
            // Точка на конце линии (с изменением цвета при hover)
            const endPoint = new paper.Path.Circle({
                center: [element.end.x, element.end.y],
                radius: pointRadius,
                fillColor: isEndHovered ? '#ff8800' : '#0073aa', // Оранжевый при hover
                strokeColor: '#fff',
                strokeWidth: 2,
            });
            endPoint.data = { elementId: element.id, pointType: 'end', type: 'linePoint' };
        }

        // Отображаем номера концов линий (только если включена отладка)
        if (pointNumberMap && debugNumbersVisible) {
            const startKey = `${element.id}:start`;
            const endKey = `${element.id}:end`;
            const startNumber = pointNumberMap.get(startKey);
            const endNumber = pointNumberMap.get(endKey);
            
            if (startNumber !== undefined) {
                const text = new paper.PointText({
                    point: [element.start.x + 8, element.start.y - 8],
                    content: `${startNumber}`,
                    fillColor: '#ff0000',
                    fontSize: 12,
                    fontWeight: 'bold',
                });
            }
            
            if (endNumber !== undefined) {
                const text = new paper.PointText({
                    point: [element.end.x + 8, element.end.y - 8],
                    content: `${endNumber}`,
                    fillColor: '#ff0000',
                    fontSize: 12,
                    fontWeight: 'bold',
                });
            }
        }

        // Отрисовка размеров (сноска)
        if (dimensionsVisible) {
            drawDimensionCallout(scope, element, isSelected || isHovered);
        }
    };

    const drawArc = (scope, element, isSelected, isHovered = false, isDeleteHovered = false) => {
        const center = new paper.Point(element.center.x, element.center.y);
        const radius = element.radius;
        const startAngle = element.startAngle || 0;
        const angle = element.angle || 90;

        const startAngleRad = (startAngle * Math.PI) / 180;
        const endAngleRad = startAngleRad + (angle * Math.PI) / 180;

        const startPoint = new paper.Point(
            center.x + radius * Math.cos(startAngleRad),
            center.y + radius * Math.sin(startAngleRad)
        );
        const endPoint = new paper.Point(
            center.x + radius * Math.cos(endAngleRad),
            center.y + radius * Math.sin(endAngleRad)
        );

        const largeArcFlag = angle > 180 ? 1 : 0;

        // Создаем путь для дуги используя Paper.js Arc
        // Paper.js Arc создается через три точки: from, through, to
        // through - это точка на дуге между from и to
        const midAngle = startAngleRad + (angle * Math.PI) / 360;
        const throughPoint = new paper.Point(
            center.x + radius * Math.cos(midAngle),
            center.y + radius * Math.sin(midAngle)
        );
        
        const path = new paper.Path.Arc({
            from: startPoint,
            through: throughPoint,
            to: endPoint,
        });

        // Приоритет: delete hovered (red) > selected > hovered > обычный
        if (isDeleteHovered) {
            path.strokeColor = '#ff0000';
            path.strokeWidth = 3;
        } else if (isSelected) {
            path.strokeColor = '#0073aa';
            path.strokeWidth = 3;
        } else if (isHovered) {
            path.strokeColor = '#0073aa';
            path.strokeWidth = 2;
        } else {
            path.strokeColor = '#000';
            path.strokeWidth = 2;
        }
        
        path.data = { elementId: element.id, type: 'arc' };
    };

    const drawFillet = (scope, element, isSelected = false, allElements = elements, pointNumberMap = null, isDeleteHovered = false) => {
        if (element.type !== 'fillet') return;
        
        // Приоритет: delete hovered (red) > selected > обычный
        const strokeColor = isDeleteHovered ? '#ff0000' : (isSelected ? '#0073aa' : '#000');
        const strokeWidth = (isDeleteHovered || isSelected) ? 3 : 2;
        
        // Отрисовываем только дугу, линии отрисовываются отдельно как обычные элементы
        const arc = element.arc;
        // Используем сохраненные точки арки, если они есть, для гарантии правильной привязки к линиям
        // Fallback на пересчет из углов для обратной совместимости
        let startPoint, endPoint;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1078',message:'drawFillet checking saved points',data:{hasArcStartPoint:!!element.arcStartPoint,hasArcEndPoint:!!element.arcEndPoint,arcStartPoint:element.arcStartPoint,arcEndPoint:element.arcEndPoint},timestamp:Date.now(),sessionId:'debug-session',runId:'debug',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        if (element.arcStartPoint && element.arcEndPoint) {
            // Используем сохраненные точки (они точно лежат на линиях)
            startPoint = new paper.Point(element.arcStartPoint.x, element.arcStartPoint.y);
            endPoint = new paper.Point(element.arcEndPoint.x, element.arcEndPoint.y);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1081',message:'drawFillet using saved points',data:{startPoint:{x:startPoint.x,y:startPoint.y},endPoint:{x:endPoint.x,y:endPoint.y}},timestamp:Date.now(),sessionId:'debug-session',runId:'debug',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        } else {
            // Fallback: вычисляем точки от центра с заданным радиусом и углами
            const startAngleRad = (arc.startAngle * Math.PI) / 180;
            const endAngleRad = startAngleRad + (arc.angle * Math.PI) / 180;
            startPoint = new paper.Point(
                arc.center.x + arc.radius * Math.cos(startAngleRad),
                arc.center.y + arc.radius * Math.sin(startAngleRad)
            );
            endPoint = new paper.Point(
                arc.center.x + arc.radius * Math.cos(endAngleRad),
                arc.center.y + arc.radius * Math.sin(endAngleRad)
            );
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1094',message:'drawFillet using calculated points',data:{startPoint:{x:startPoint.x,y:startPoint.y},endPoint:{x:endPoint.x,y:endPoint.y}},timestamp:Date.now(),sessionId:'debug-session',runId:'debug',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
        }
        
        // Получаем обновленные координаты линий
        const line1 = allElements.find(el => el.id === element.line1Id);
        const line2 = allElements.find(el => el.id === element.line2Id);
        
        // #region agent log
        if (line1 && line2) {
            const line1EndPoint = line1.end;
            const line1StartPoint = line1.start;
            const line2EndPoint = line2.end;
            const line2StartPoint = line2.start;
            const distStartToLine1End = startPoint.getDistance(new paper.Point(line1EndPoint.x, line1EndPoint.y));
            const distStartToLine1Start = startPoint.getDistance(new paper.Point(line1StartPoint.x, line1StartPoint.y));
            const distEndToLine2End = endPoint.getDistance(new paper.Point(line2EndPoint.x, line2EndPoint.y));
            const distEndToLine2Start = endPoint.getDistance(new paper.Point(line2StartPoint.x, line2StartPoint.y));
            fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:890',message:'drawFillet arc vs line points',data:{arcStartPoint:{x:startPoint.x,y:startPoint.y},arcEndPoint:{x:endPoint.x,y:endPoint.y},line1:{start:line1StartPoint,end:line1EndPoint},line2:{start:line2StartPoint,end:line2EndPoint},distStartToLine1End,distStartToLine1Start,distEndToLine2End,distEndToLine2Start,expectedArcStartPoint:element.arcStartPoint,expectedArcEndPoint:element.arcEndPoint},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
        }
        // #endregion
        
        // Строим дугу, начиная с startPoint и заканчивая endPoint, чтобы гарантировать правильную привязку к линиям
        // Используем сохраненные точки как начальную и конечную точки дуги
        const centerPoint = new paper.Point(arc.center.x, arc.center.y);
        
        // Вычисляем углы от центра к начальной и конечной точкам
        const startAngleRad = Math.atan2(startPoint.y - centerPoint.y, startPoint.x - centerPoint.x);
        const endAngleRad = Math.atan2(endPoint.y - centerPoint.y, endPoint.x - centerPoint.x);
        
        // Вычисляем разность углов и нормализуем к [-π, π]
        let angleDiff = endAngleRad - startAngleRad;
        if (angleDiff > Math.PI) {
            angleDiff -= 2 * Math.PI;
        } else if (angleDiff < -Math.PI) {
            angleDiff += 2 * Math.PI;
        }
        
        // Строим Path, начиная с сохраненной начальной точки
        const arcPath = new paper.Path();
        arcPath.add(startPoint); // Начинаем с сохраненной точки, которая точно лежит на линии
        
        // Добавляем промежуточные точки дуги между startPoint и endPoint
        const numSegments = Math.max(8, Math.ceil(Math.abs(angleDiff) * 180 / Math.PI / 5)); // Минимум 8 сегментов, или по 5 градусов на сегмент
        
        // Добавляем промежуточные точки (пропускаем первую точку, так как она уже добавлена)
        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const angle = startAngleRad + t * angleDiff;
            const point = new paper.Point(
                centerPoint.x + arc.radius * Math.cos(angle),
                centerPoint.y + arc.radius * Math.sin(angle)
            );
            arcPath.add(point);
        }
        
        // Заканчиваем сохраненной конечной точкой, которая точно лежит на линии
        arcPath.add(endPoint);
        
        arcPath.strokeColor = strokeColor;
        arcPath.strokeWidth = strokeWidth;
        arcPath.data = { elementId: element.id, type: 'fillet-arc' };
        
        // Отображаем номера точек арки и их соответствие с концами линий (только если включена отладка)
        if (pointNumberMap && line1 && line2 && debugNumbersVisible) {
            // Определяем, к каким концам линий привязаны точки арки
            const distStartToLine1End = startPoint.getDistance(new paper.Point(line1.end.x, line1.end.y));
            const distStartToLine1Start = startPoint.getDistance(new paper.Point(line1.start.x, line1.start.y));
            const distEndToLine2End = endPoint.getDistance(new paper.Point(line2.end.x, line2.end.y));
            const distEndToLine2Start = endPoint.getDistance(new paper.Point(line2.start.x, line2.start.y));
            
            // Определяем, к какому концу line1 ближе arcStartPoint
            const line1PointType = distStartToLine1End < distStartToLine1Start ? 'end' : 'start';
            const line1Key = `${line1.id}:${line1PointType}`;
            const line1PointNumber = pointNumberMap.get(line1Key);
            
            // Определяем, к какому концу line2 ближе arcEndPoint
            const line2PointType = distEndToLine2End < distEndToLine2Start ? 'end' : 'start';
            const line2Key = `${line2.id}:${line2PointType}`;
            const line2PointNumber = pointNumberMap.get(line2Key);
            
            // Отображаем номер для arcStartPoint (соответствует концу line1)
            if (line1PointNumber !== undefined) {
                const text = new paper.PointText({
                    point: [startPoint.x + 8, startPoint.y - 8],
                    content: `A${line1PointNumber}`,
                    fillColor: '#00ff00',
                    fontSize: 12,
                    fontWeight: 'bold',
                });
            }
            
            // Отображаем номер для arcEndPoint (соответствует концу line2)
            if (line2PointNumber !== undefined) {
                const text = new paper.PointText({
                    point: [endPoint.x + 8, endPoint.y - 8],
                    content: `A${line2PointNumber}`,
                    fillColor: '#00ff00',
                    fontSize: 12,
                    fontWeight: 'bold',
                });
            }
        }
        
        // Отрисовываем сноску с радиусом, если включено отображение размеров
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1244',message:'before drawFilletDimensionCallout',data:{dimensionsVisible,hasArcCenter:!!arc.center,arcCenter:arc.center,arcRadius:arc.radius},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        if (dimensionsVisible && arc.center) {
            drawFilletDimensionCallout(scope, element, isSelected, arc.center, arc.radius, pointNumberMap, allElements);
        }
    };

    const drawChamfer = (scope, element, isSelected = false, allElements = elements, pointNumberMap = null, isDeleteHovered = false) => {
        if (element.type !== 'chamfer') return;
        
        // Приоритет: delete hovered (red) > selected > обычный
        const strokeColor = isDeleteHovered ? '#ff0000' : (isSelected ? '#0073aa' : '#000');
        const strokeWidth = (isDeleteHovered || isSelected) ? 3 : 2;
        
        // Отрисовываем прямую линию между точками обрезки
        const startPoint = new paper.Point(element.start.x, element.start.y);
        const endPoint = new paper.Point(element.end.x, element.end.y);
        
        const chamferLine = new paper.Path.Line({
            from: startPoint,
            to: endPoint,
            strokeColor: strokeColor,
            strokeWidth: strokeWidth,
        });
        chamferLine.data = { elementId: element.id, type: 'chamfer-line' };
        
        // Отображаем номера точек, если включена отладка
        if (pointNumberMap && debugNumbersVisible) {
            const line1 = allElements.find(el => el.id === element.line1Id);
            const line2 = allElements.find(el => el.id === element.line2Id);
            
            if (line1 && line2) {
                const distStartToLine1End = startPoint.getDistance(new paper.Point(line1.end.x, line1.end.y));
                const distStartToLine1Start = startPoint.getDistance(new paper.Point(line1.start.x, line1.start.y));
                const distEndToLine2End = endPoint.getDistance(new paper.Point(line2.end.x, line2.end.y));
                const distEndToLine2Start = endPoint.getDistance(new paper.Point(line2.start.x, line2.start.y));
                
                const line1PointType = distStartToLine1End < distStartToLine1Start ? 'end' : 'start';
                const line1Key = `${line1.id}:${line1PointType}`;
                const line1PointNumber = pointNumberMap.get(line1Key);
                
                const line2PointType = distEndToLine2End < distEndToLine2Start ? 'end' : 'start';
                const line2Key = `${line2.id}:${line2PointType}`;
                const line2PointNumber = pointNumberMap.get(line2Key);
                
                if (line1PointNumber !== undefined) {
                    new paper.PointText({
                        point: [startPoint.x + 8, startPoint.y - 8],
                        content: `C${line1PointNumber}`,
                        fillColor: '#00ff00',
                        fontSize: 12,
                        fontWeight: 'bold',
                    });
                }
                
                if (line2PointNumber !== undefined) {
                    new paper.PointText({
                        point: [endPoint.x + 8, endPoint.y - 8],
                        content: `C${line2PointNumber}`,
                        fillColor: '#00ff00',
                        fontSize: 12,
                        fontWeight: 'bold',
                    });
                }
            }
        }
        
        // Отрисовываем сноску с глубиной, если включено отображение размеров
        if (dimensionsVisible) {
            const midPoint = {
                x: (element.start.x + element.end.x) / 2,
                y: (element.start.y + element.end.y) / 2,
            };
            drawChamferDimensionCallout(scope, element, isSelected, midPoint, element.depth, pointNumberMap, allElements);
        }
    };

    const drawDimensionCallout = (scope, element, isSelected) => {
        if (element.type !== 'line') return;

        const midX = (element.start.x + element.end.x) / 2;
        const midY = (element.start.y + element.end.y) / 2;
        const leaderLength = 15;
        const horizontalLength = 40;
        const angle = 45;
        const angleRad = (angle * Math.PI) / 180;

        const leaderStartX = midX;
        const leaderStartY = midY;
        const leaderEndX = midX + Math.cos(angleRad) * leaderLength;
        const leaderEndY = midY - Math.sin(angleRad) * leaderLength;

        const horizontalStartX = leaderEndX;
        const horizontalStartY = leaderEndY;
        const horizontalEndX = leaderEndX + horizontalLength;
        const horizontalEndY = leaderEndY;

        const textY = horizontalStartY - 3; // В половину меньше смещения (было -12, потом +5, теперь -3)

        const lengthText = formatLengthMM(element.length || distance(element.start, element.end));
        const strokeColor = isSelected ? '#0073aa' : '#999'; // Светлее для невыбранных
        const lineWidth = 0.5; // Тоньше (было 1)

        // Определяем, является ли линия вертикальной
        const isVertical = Math.abs(element.start.x - element.end.x) < 0.1;

        // Косая линия
        const leaderLine = new paper.Path.Line({
            from: [leaderStartX, leaderStartY],
            to: [leaderEndX, leaderEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        // Горизонтальная линия
        const horizontalLine = new paper.Path.Line({
            from: [horizontalStartX, horizontalStartY],
            to: [horizontalEndX, horizontalEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        // Создаем текст временно для получения его ширины
        const tempText = new paper.PointText({
            point: [0, 0],
            content: lengthText,
            fillColor: strokeColor,
            fontSize: 11,
        });
        const textWidth = tempText.bounds.width;
        tempText.remove(); // Удаляем временный текст

        // Выравниваем текст по правому краю сноски (horizontalEndX)
        // В Paper.js точка позиционирования - это левый край текста, поэтому вычитаем ширину
        const textX = horizontalEndX - textWidth;
        // Для всех линий используем textY, чтобы текст был над сноской

        // Текст - выровнен по правому краю сноски
        const text = new paper.PointText({
            point: [textX, textY],
            content: lengthText,
            fillColor: strokeColor,
            fontSize: 11,
        });
    };

    const drawFilletDimensionCallout = (scope, element, isSelected, arcCenter, arcRadius, pointNumberMap = null, allElements = []) => {
        if (element.type !== 'fillet') return;

        // Определяем номера точек для анализа углов 6-7 и 14-15
        let line1PointNumber = null;
        let line2PointNumber = null;
        if (pointNumberMap && element.line1Id && element.line2Id) {
            const line1 = allElements.find(el => el.id === element.line1Id && el.type === 'line');
            const line2 = allElements.find(el => el.id === element.line2Id && el.type === 'line');
            
            if (line1 && line2 && element.arcStartPoint && element.arcEndPoint) {
                // Определяем, к каким концам линий привязаны точки арки
                const distStartToLine1End = distance(element.arcStartPoint, line1.end);
                const distStartToLine1Start = distance(element.arcStartPoint, line1.start);
                const distEndToLine2End = distance(element.arcEndPoint, line2.end);
                const distEndToLine2Start = distance(element.arcEndPoint, line2.start);
                
                const line1PointType = distStartToLine1End < distStartToLine1Start ? 'end' : 'start';
                const line1Key = `${line1.id}:${line1PointType}`;
                line1PointNumber = pointNumberMap.get(line1Key);
                
                const line2PointType = distEndToLine2End < distEndToLine2Start ? 'end' : 'start';
                const line2Key = `${line2.id}:${line2PointType}`;
                line2PointNumber = pointNumberMap.get(line2Key);
            }
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1357',message:'drawFilletDimensionCallout called',data:{arcCenter,arcRadius,line1PointNumber,line2PointNumber,isAngle6_7:(line1PointNumber===6&&line2PointNumber===7)||(line1PointNumber===7&&line2PointNumber===6),isAngle14_15:(line1PointNumber===14&&line2PointNumber===15)||(line1PointNumber===15&&line2PointNumber===14)},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-angles',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        const leaderLength = 15;
        const horizontalLength = 40;

        // Центр радиуса - это начальная точка отрисовки сноски
        const centerX = arcCenter.x;
        const centerY = arcCenter.y;
        
        // Вычисляем середину видимого отрезка радиуса (дуги)
        // Используем сохраненные точки начала и конца дуги для точного вычисления середины
        let arcPointX, arcPointY;
        if (element.arcStartPoint && element.arcEndPoint) {
            // Вычисляем среднюю точку между началом и концом дуги
            arcPointX = (element.arcStartPoint.x + element.arcEndPoint.x) / 2;
            arcPointY = (element.arcStartPoint.y + element.arcEndPoint.y) / 2;
            
            // Проектируем эту точку на дугу (на расстояние arcRadius от центра)
            const dx = arcPointX - centerX;
            const dy = arcPointY - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0.0001) {
                // Нормализуем и масштабируем до радиуса
                arcPointX = centerX + (dx / dist) * arcRadius;
                arcPointY = centerY + (dy / dist) * arcRadius;
            }
        } else {
            // Fallback: используем средний угол дуги
        const arc = element.arc;
            const startAngleRad = (arc.startAngle * Math.PI) / 180;
            const angleRad = (arc.angle * Math.PI) / 180;
            const midAngleRad = startAngleRad + angleRad / 2;
            arcPointX = centerX + Math.cos(midAngleRad) * arcRadius;
            arcPointY = centerY + Math.sin(midAngleRad) * arcRadius;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1345',message:'arc midpoint calculation',data:{arcCenter:{x:centerX,y:centerY},arcRadius,arcStartPoint:element.arcStartPoint,arcEndPoint:element.arcEndPoint,arcPoint:{x:arcPointX,y:arcPointY}},timestamp:Date.now(),sessionId:'debug-session',runId:'check-arc-midpoint',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        
        // Первая линия: от центра радиуса до точки на дуге (проходит через середину видимого элемента)
        const leaderStartX = centerX;
        const leaderStartY = centerY;
        const leaderEndX = arcPointX;
        const leaderEndY = arcPointY;

        // Определяем направление "снаружи" угла
        // Используем сохраненные направления линий для вычисления биссектрисы
        let outsideDir;
        if (element.line1Direction && element.line2Direction) {
            // Вычисляем биссектрису (направлена внутрь угла)
            const bisectorUnnormalized = {
                x: element.line1Direction.x + element.line2Direction.x,
                y: element.line1Direction.y + element.line2Direction.y
            };
            const bisectorLength = Math.sqrt(bisectorUnnormalized.x * bisectorUnnormalized.x + bisectorUnnormalized.y * bisectorUnnormalized.y);
            const bisectorDir = bisectorLength > 0.0001
                ? { x: bisectorUnnormalized.x / bisectorLength, y: bisectorUnnormalized.y / bisectorLength }
                : { x: -element.line1Direction.y, y: element.line1Direction.x };
            
            // Направление "снаружи" - противоположно биссектрисе
            outsideDir = { x: -bisectorDir.x, y: -bisectorDir.y };
        } else {
            // Fallback: используем направление от центра к точке на дуге, повернутое на 90 градусов
            const dirToArc = {
                x: arcPointX - centerX,
                y: arcPointY - centerY
            };
            const dirLength = Math.sqrt(dirToArc.x * dirToArc.x + dirToArc.y * dirToArc.y);
            if (dirLength > 0.0001) {
                const normalizedDir = { x: dirToArc.x / dirLength, y: dirToArc.y / dirLength };
                // Поворачиваем на 90 градусов против часовой стрелки для направления снаружи
                outsideDir = { x: -normalizedDir.y, y: normalizedDir.x };
            } else {
                // Последний fallback: фиксированное направление
                outsideDir = { x: Math.cos(45 * Math.PI / 180), y: -Math.sin(45 * Math.PI / 180) };
            }
        }

        // Косая линия: от точки на дуге в направлении "снаружи" угла
        const diagonalEndX = arcPointX + outsideDir.x * leaderLength;
        const diagonalEndY = arcPointY + outsideDir.y * leaderLength;

        // Горизонтальная линия: от конца косой линии
        const horizontalStartX = diagonalEndX;
        const horizontalStartY = diagonalEndY;
        const horizontalEndX = diagonalEndX + horizontalLength;
        const horizontalEndY = diagonalEndY;

        // Определяем, должен ли текст быть над линией на основе направления outsideDir
        // outsideDir - это направление "снаружи" угла, вычисленное из геометрии угла
        // Если outsideDir направлен вверх (y < 0), текст над линией
        // Если outsideDir направлен вниз (y > 0), текст под линией
        const textAboveLine = outsideDir.y < 0;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1475',message:'text placement analysis',data:{line1PointNumber,line2PointNumber,textAboveLine,horizontalStartY,centerY,outsideDir,outsideDirY:outsideDir.y},timestamp:Date.now(),sessionId:'debug-session',runId:'analyze-angles',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Позиция текста - над или под горизонтальной линией
        // Для текста над линией используем меньший отступ (-3 вместо -14), чтобы текст не был слишком высоко
        const textY = textAboveLine 
            ? horizontalStartY - 3  // Отступ вверх от линии (3 пикселя для размещения текста над линией)
            : horizontalStartY + 14; // Отступ вниз от линии (14 пикселей для размещения текста под линией)

        const radiusText = 'R ' + formatLengthMM(arcRadius);
        const strokeColor = isSelected ? '#0073aa' : '#999';
        const lineWidth = 0.5;

        // Первая линия: от центра радиуса до точки на дуге
        const leaderLine = new paper.Path.Line({
            from: [leaderStartX, leaderStartY],
            to: [leaderEndX, leaderEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        // Косая линия: от точки на дуге под углом 45 градусов вправо-вверх
        const diagonalLine = new paper.Path.Line({
            from: [arcPointX, arcPointY],
            to: [diagonalEndX, diagonalEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        // Горизонтальная линия: от конца косой линии
        const horizontalLine = new paper.Path.Line({
            from: [horizontalStartX, horizontalStartY],
            to: [horizontalEndX, horizontalEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        // Создаем текст временно для получения его ширины
        const tempText = new paper.PointText({
            point: [0, 0],
            content: radiusText,
            fillColor: strokeColor,
            fontSize: 11,
        });
        const textWidth = tempText.bounds.width;
        tempText.remove();

        // Выравниваем текст по правому краю горизонтальной линии
        const finalTextX = horizontalEndX - textWidth;

        // Текст - выровнен по правому краю горизонтальной линии
        const text = new paper.PointText({
            point: [finalTextX, textY],
            content: radiusText,
            fillColor: strokeColor,
            fontSize: 11,
        });
    };

    // Создание скругления (fillet) между двумя линиями
    const createFilletAtCorner = (line1Param, line2Param) => {
        // Получаем актуальные версии линий из store перед созданием fillet
        const currentState = useEditorStore.getState();
        const actualLine1 = currentState.elements.find(el => el.id === line1Param.id);
        const actualLine2 = currentState.elements.find(el => el.id === line2Param.id);
        
        if (!actualLine1 || !actualLine2 || actualLine1.type !== 'line' || actualLine2.type !== 'line') {
            return;
        }
        
        // Нормализуем порядок линий: всегда используем линию с меньшим ID как line1
        // Это гарантирует, что логика не зависит от порядка параметров
        const line1 = actualLine1.id < actualLine2.id ? actualLine1 : actualLine2;
        const line2 = actualLine1.id < actualLine2.id ? actualLine2 : actualLine1;
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1142',message:'createFilletAtCorner entry with actual lines',data:{line1:{id:line1.id,start:line1.start,end:line1.end},line2:{id:line2.id,start:line2.start,end:line2.end}},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const connection = findConnectionPoint(line1, line2, 10);
        
        if (!connection) {
            return;
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:976',message:'connection found',data:{connection:connection,line1End:connection.line1End,line2End:connection.line2End},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        const arcRadius = mmToPixels(3); // 3 мм по умолчанию
        
        // Определяем, какой конец каждой линии является точкой соединения
        const distToLine1Start = distance(connection, line1.start);
        const distToLine1End = distance(connection, line1.end);
        const distToLine2Start = distance(connection, line2.start);
        const distToLine2End = distance(connection, line2.end);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:985',message:'distances calculated',data:{distToLine1Start,distToLine1End,distToLine2Start,distToLine2End,line1EndCloser:distToLine1End<distToLine1Start,line2EndCloser:distToLine2End<distToLine2Start},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Вычисляем точки арки для каждой линии независимо от порядка параметров
        // Для каждой линии определяем направление от connection к дальнему концу линии
        // и вычисляем точку арки на этом направлении на расстоянии arcRadius
        
        // Вычисляем нормализованное направление каждой линии (от start к end)
        const line1Dir = lineDirection(line1);
        const line2Dir = lineDirection(line2);
        
        // Определяем, в какую сторону от connection находится точка арки для каждой линии
        // Если connection ближе к концу линии, точка арки должна быть в направлении от start к end (от connection к start)
        // Если connection ближе к началу, точка арки должна быть в направлении от end к start (от connection к end)
        const line1DirToFar = distToLine1End < distToLine1Start ? { x: -line1Dir.x, y: -line1Dir.y } : line1Dir;
        const line2DirToFar = distToLine2End < distToLine2Start ? { x: -line2Dir.x, y: -line2Dir.y } : line2Dir;
        
        // Вычисляем точки арки на линиях на расстоянии arcRadius от connection
        // Важно: эти точки вычисляются на основе конкретных линий, но пока без привязки к line1/line2
        const arcPoint1 = {
            x: connection.x + line1DirToFar.x * arcRadius,
            y: connection.y + line1DirToFar.y * arcRadius,
        };
        const arcPoint2 = {
            x: connection.x + line2DirToFar.x * arcRadius,
            y: connection.y + line2DirToFar.y * arcRadius,
        };
        
        // Теперь определяем, какая точка относится к какой линии (line1 или line2) по ID линий
        // Это гарантирует, что точки всегда привязаны к правильным линиям, независимо от порядка параметров
        // Для совместимости с существующим кодом, arcStartPoint всегда относится к line1, arcEndPoint - к line2
        const arcStartPoint = arcPoint1; // Всегда точка на line1 (первый параметр функции)
        const arcEndPoint = arcPoint2;   // Всегда точка на line2 (второй параметр функции)
        
        // Используем эти направления для вычисления углов
        const dir1 = line1DirToFar;
        const dir2 = line2DirToFar;
        
        const angle1 = Math.atan2(dir1.y, dir1.x) * (180 / Math.PI);
        const angle2 = Math.atan2(dir2.y, dir2.x) * (180 / Math.PI);
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:993',message:'directions calculated',data:{dir1,dir2,line1Dir,line2Dir,line1DirToFar,line2DirToFar,arcStartPoint,arcEndPoint},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1004',message:'arc points calculated',data:{arcStartPoint,arcEndPoint,arcRadius,angle1,angle2},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Вычисляем центр арки как пересечение перпендикуляров от точек арки к линиям
        // Точки арки находятся на линиях на расстоянии arcRadius от connection
        // Центр должен находиться на пересечении перпендикуляров от этих точек к линиям
        
        let angleDiff = Math.abs(angle2 - angle1);
        if (angleDiff > 180) {
            angleDiff = 360 - angleDiff;
        }
        const angleDiffRad = (angleDiff * Math.PI) / 180;
        
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
        
        // Перпендикуляры должны идти внутрь угла, поэтому если скалярное произведение положительное, перпендикуляр направлен внутрь - оставляем как есть
        // Если отрицательное - направлен наружу, инвертируем
        const finalPerp1Dir = perp1Dot > 0 ? perp1Dir : { x: -perp1Dir.x, y: -perp1Dir.y };
        const finalPerp2Dir = perp2Dot > 0 ? perp2Dir : { x: -perp2Dir.x, y: -perp2Dir.y };
        
        // Пересечение прямых: arcStartPoint + t * finalPerp1Dir и arcEndPoint + s * finalPerp2Dir
        const dx = arcEndPoint.x - arcStartPoint.x;
        const dy = arcEndPoint.y - arcStartPoint.y;
        const denom = finalPerp1Dir.x * finalPerp2Dir.y - finalPerp1Dir.y * finalPerp2Dir.x;
        
        let arcCenter;
        if (Math.abs(denom) < 0.0001) {
            // Линии параллельны, используем fallback через биссектрису
            const centerDist = angleDiffRad > 0.0001 
                ? arcRadius / Math.sin(angleDiffRad / 2)
                : arcRadius;
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
        
        // #region agent log
        const centerDist = angleDiffRad > 0.0001 ? arcRadius / Math.sin(angleDiffRad / 2) : arcRadius;
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1560',message:'arc center calculation',data:{angle1,angle2,angleDiff,angleDiffRad,arcCenter,arcRadius,connection,dir1,dir2,bisectorDir,centerDist,arcStartPoint,arcEndPoint,distFromCenterToStart:distance(arcCenter,arcStartPoint),distFromCenterToEnd:distance(arcCenter,arcEndPoint)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Точки арки уже правильно вычислены от connection на линиях
        // Они находятся на расстоянии arcRadius от connection на каждой линии
        // Используем эти точки для обрезки линий - они гарантированно лежат на линиях
        
        // Вычисляем углы от центра к точкам арки для определения углов дуги
        const arcStartAngleRad = Math.atan2(arcStartPoint.y - arcCenter.y, arcStartPoint.x - arcCenter.x);
        const arcEndAngleRad = Math.atan2(arcEndPoint.y - arcCenter.y, arcEndPoint.x - arcCenter.x);
        
        // Вычисляем угол дуги как разность углов от начальной точки к конечной
        // Для fillet дуга всегда идет внутрь угла по кратчайшему пути
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
        
        // Используем исходные точки арки для обрезки линий (они лежат на линиях)
        // После нормализации порядка линий, arcStartPoint всегда на line1, arcEndPoint всегда на line2
        // Это гарантирует, что результат не зависит от порядка параметров
        const finalArcStartPoint = arcStartPoint; // Всегда точка на line1 (линия с меньшим ID)
        const finalArcEndPoint = arcEndPoint;     // Всегда точка на line2 (линия с большим ID)
        
        // Сохраняем исходные длины линий
        const originalLine1Length = line1.length || distance(line1.start, line1.end);
        const originalLine2Length = line2.length || distance(line2.start, line2.end);
        
        // После нормализации порядка линий, точки арки уже привязаны к правильным линиям
        const arcPointForLine1 = finalArcStartPoint; // Точка арки для line1
        const arcPointForLine2 = finalArcEndPoint;   // Точка арки для line2
        
        const EPSILON = 0.01;
        
        // Определяем, какой конец каждой линии обрезается
        // Для line1: проверяем, к какому концу ближе точка арки, которая относится к line1
        const distArcPoint1ToLine1End = distance(arcPointForLine1, line1.end);
        const distArcPoint1ToLine1Start = distance(arcPointForLine1, line1.start);
        const line1EndTruncated = distArcPoint1ToLine1End + EPSILON < distArcPoint1ToLine1Start;
        
        // Для line2: проверяем, к какому концу ближе точка арки, которая относится к line2
        const distArcPoint2ToLine2End = distance(arcPointForLine2, line2.end);
        const distArcPoint2ToLine2Start = distance(arcPointForLine2, line2.start);
        const line2EndTruncated = distArcPoint2ToLine2End + EPSILON < distArcPoint2ToLine2Start;
        
        // Обрезаем линии до точек арки (используем правильные точки для каждой линии)
        const line1Update = line1EndTruncated
            ? { end: arcPointForLine1, length: originalLine1Length }
            : { start: arcPointForLine1, length: originalLine1Length };
        const line2Update = line2EndTruncated
            ? { end: arcPointForLine2, length: originalLine2Length }
            : { start: arcPointForLine2, length: originalLine2Length };
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1234',message:'before updateElement',data:{line1Id:line1.id,line1:{start:line1.start,end:line1.end},line1Update,line2Id:line2.id,line2:{start:line2.start,end:line2.end},line2Update,arcStartPoint:finalArcStartPoint,arcEndPoint:finalArcEndPoint,originalArcStartPoint:arcStartPoint,originalArcEndPoint:arcEndPoint,line1EndTruncated,line2EndTruncated,distArcPoint1ToLine1End,distArcPoint1ToLine1Start,distArcPoint2ToLine2End,distArcPoint2ToLine2Start,distToLine1Start,distToLine1End,distToLine2Start,distToLine2End,connection,dir1,dir2,arcCenter},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        // Обновляем обе линии
        updateElement(line1.id, line1Update);
        updateElement(line2.id, line2Update);
        
        // #region agent log
        const stateAfterUpdate = useEditorStore.getState();
        const line1After = stateAfterUpdate.elements.find(el => el.id === line1.id);
        const line2After = stateAfterUpdate.elements.find(el => el.id === line2.id);
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1254',message:'after updateElement',data:{line1After:{start:line1After?.start,end:line1After?.end},line2After:{start:line2After?.start,end:line2After?.end},arcStartPoint:finalArcStartPoint,arcEndPoint:finalArcEndPoint,expectedLine1End:line1EndTruncated?finalArcStartPoint:line1.end,expectedLine2Start:line2EndTruncated?line2.start:finalArcEndPoint},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // Создаем объект fillet, который содержит дугу и ссылки на обрезанные линии
        const fillet = {
            type: 'fillet',
            radius: arcRadius,
            line1Id: line1.id,  // ID первой линии
            line2Id: line2.id,  // ID второй линии
            // Дуга между линиями
            arc: {
                center: arcCenter,
                radius: arcRadius,
                startAngle: arcStartAngle,
                angle: arcAngle,
            },
            // Сохраняем точки начала и конца арки (они лежат на линиях на расстоянии arcRadius от connection)
            // Важно: arcStartPoint всегда относится к line1, arcEndPoint всегда относится к line2
            // Это нужно для совместимости с существующим кодом (drawFillet и т.д.)
            arcStartPoint: arcPointForLine1, // Точка арки, которая относится к line1
            arcEndPoint: arcPointForLine2,   // Точка арки, которая относится к line2
            // Данные для пересчета при изменении радиуса
            connection: connection,
            line1Direction: dir1,
            line2Direction: dir2,
            angle1: angle1,
            angle2: angle2,
            // Сохраняем информацию о том, какой конец каждой линии обрезается
            line1EndTruncated: line1EndTruncated,
            line2EndTruncated: line2EndTruncated,
        };
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/49b89e88-4674-4191-9133-bf7fd16c00a5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CanvasEditor.jsx:1088',message:'fillet created',data:{fillet:{...fillet,arc:{...fillet.arc}}},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Добавляем fillet
        addElement(fillet);
        
        selectElement(null);
    };

    const drawChamferDimensionCallout = (scope, element, isSelected, midPoint, depth, pointNumberMap = null, allElements = []) => {
        if (element.type !== 'chamfer') return;
        
        const depthMM = Math.round(pixelsToMM(depth));
        const text = `${depthMM} мм`;
        
        const strokeColor = isSelected ? '#0073aa' : '#999';
                    const lineWidth = 0.5;
                    
        // Линия от середины фаски
        const leaderLength = 15;
        const horizontalLength = 40;
        const angle = 45;
        const angleRad = (angle * Math.PI) / 180;

        const leaderEndX = midPoint.x + Math.cos(angleRad) * leaderLength;
        const leaderEndY = midPoint.y - Math.sin(angleRad) * leaderLength;

        const horizontalStartX = leaderEndX;
        const horizontalStartY = leaderEndY;
        const horizontalEndX = leaderEndX + horizontalLength;
        const horizontalEndY = leaderEndY;

        const textY = horizontalStartY - 3;

        const leaderLine = new paper.Path.Line({
            from: [midPoint.x, midPoint.y],
            to: [leaderEndX, leaderEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        const horizontalLine = new paper.Path.Line({
            from: [horizontalStartX, horizontalStartY],
            to: [horizontalEndX, horizontalEndY],
            strokeColor: strokeColor,
            strokeWidth: lineWidth,
        });

        const textElement = new paper.PointText({
            point: [horizontalEndX + 5, textY],
            content: text,
            fillColor: strokeColor,
            fontSize: 10,
        });
    };

    const createChamferAtCorner = (line1Param, line2Param) => {
        // Получаем актуальные версии линий из store перед созданием chamfer
        const currentState = useEditorStore.getState();
        const actualLine1 = currentState.elements.find(el => el.id === line1Param.id);
        const actualLine2 = currentState.elements.find(el => el.id === line2Param.id);
        
        if (!actualLine1 || !actualLine2 || actualLine1.type !== 'line' || actualLine2.type !== 'line') {
            return;
        }
        
        // Нормализуем порядок линий: всегда используем линию с меньшим ID как line1
        const line1 = actualLine1.id < actualLine2.id ? actualLine1 : actualLine2;
        const line2 = actualLine1.id < actualLine2.id ? actualLine2 : actualLine1;
        
        const connection = findConnectionPoint(line1, line2, 10);
        
        if (!connection) {
            return;
        }
        
        const chamferDepth = mmToPixels(2); // 2 мм по умолчанию
        
        // Определяем, какой конец каждой линии является точкой соединения
        const distToLine1Start = distance(connection, line1.start);
        const distToLine1End = distance(connection, line1.end);
        const distToLine2Start = distance(connection, line2.start);
        const distToLine2End = distance(connection, line2.end);
        
        // Вычисляем нормализованное направление каждой линии (от start к end)
        const line1Dir = lineDirection(line1);
        const line2Dir = lineDirection(line2);
        
        // Определяем, в какую сторону от connection находится точка обрезки для каждой линии
        const line1DirToFar = distToLine1End < distToLine1Start ? { x: -line1Dir.x, y: -line1Dir.y } : line1Dir;
        const line2DirToFar = distToLine2End < distToLine2Start ? { x: -line2Dir.x, y: -line2Dir.y } : line2Dir;
        
        // Вычисляем точки обрезки на линиях на расстоянии chamferDepth от connection
        const chamferStartPoint = {
            x: connection.x + line1DirToFar.x * chamferDepth,
            y: connection.y + line1DirToFar.y * chamferDepth,
        };
        const chamferEndPoint = {
            x: connection.x + line2DirToFar.x * chamferDepth,
            y: connection.y + line2DirToFar.y * chamferDepth,
        };
        
        // Используем эти направления для вычисления углов
        const dir1 = line1DirToFar;
        const dir2 = line2DirToFar;
        
        const angle1 = Math.atan2(dir1.y, dir1.x) * (180 / Math.PI);
        const angle2 = Math.atan2(dir2.y, dir2.x) * (180 / Math.PI);
        
        // Сохраняем исходные длины линий
        const originalLine1Length = line1.length || distance(line1.start, line1.end);
        const originalLine2Length = line2.length || distance(line2.start, line2.end);
        
        const EPSILON = 0.01;
        
        // Определяем, какой конец каждой линии обрезается
        const distChamferStartToLine1End = distance(chamferStartPoint, line1.end);
        const distChamferStartToLine1Start = distance(chamferStartPoint, line1.start);
        const line1EndTruncated = distChamferStartToLine1End + EPSILON < distChamferStartToLine1Start;
        
        const distChamferEndToLine2End = distance(chamferEndPoint, line2.end);
        const distChamferEndToLine2Start = distance(chamferEndPoint, line2.start);
        const line2EndTruncated = distChamferEndToLine2End + EPSILON < distChamferEndToLine2Start;
        
        // Обрезаем линии до точек обрезки
        const line1Update = line1EndTruncated
            ? { end: chamferStartPoint, length: originalLine1Length }
            : { start: chamferStartPoint, length: originalLine1Length };
        const line2Update = line2EndTruncated
            ? { end: chamferEndPoint, length: originalLine2Length }
            : { start: chamferEndPoint, length: originalLine2Length };
        
        // Обновляем обе линии
        updateElement(line1.id, line1Update);
        updateElement(line2.id, line2Update);
        
        // Создаем объект chamfer, который содержит прямую линию и ссылки на обрезанные линии
        const chamfer = {
            type: 'chamfer',
            depth: chamferDepth,
            line1Id: line1.id,
            line2Id: line2.id,
            start: chamferStartPoint,
            end: chamferEndPoint,
            connection: connection,
            line1Direction: dir1,
            line2Direction: dir2,
            angle1: angle1,
            angle2: angle2,
            line1EndTruncated: line1EndTruncated,
            line2EndTruncated: line2EndTruncated,
        };
        
        // Добавляем chamfer
        addElement(chamfer);
        
        selectElement(null);
    };

    return (
        <div ref={containerRef} className="canvas-editor">
            <canvas
                ref={canvasRef}
                id="plintus-paperjs-canvas"
                style={{ width: '100%', height: '100%', display: 'block' }}
            />
        </div>
    );
}

export default CanvasEditor;

