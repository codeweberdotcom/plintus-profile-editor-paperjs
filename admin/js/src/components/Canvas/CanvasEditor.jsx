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
    
    const {
        elements,
        selectedElements,
        selectedTool,
        grid,
        dimensionsVisible,
        currentLineStart,
        isDrawing,
        setCurrentLineStart,
        setIsDrawing,
        addElement,
        deleteElement,
        selectElement,
        deleteSelectedElements,
    } = useEditorStore();

    const gridStepPixels = mmToPixels(grid.stepMM);
    const viewbox = useEditorStore((state) => state.viewbox);

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
            drawGrid(scope, gridStepPixels, grid.showMajorLines);
        }

        // Отрисовываем элементы
        elements.forEach((element) => {
            const isSelected = selectedElements.some(sel => sel.id === element.id);
            
            if (element.type === 'line') {
                drawLine(scope, element, isSelected);
            } else if (element.type === 'arc') {
                drawArc(scope, element, isSelected);
            }
        });

        // Временная линия будет отрисовываться в обработчике onMouseMove
        // Здесь не отрисовываем её, чтобы избежать ошибок при отсутствии события

        scope.view.draw();
    }, [elements, selectedElements, grid, dimensionsVisible, paperProject, gridStepPixels]);

    // Обработка событий мыши
    useEffect(() => {
        if (!paperProject || !paperScopeRef.current) {
            return;
        }

        const scope = paperScopeRef.current;
        scope.activate();

        const tool = new paper.Tool();
        
        tool.onMouseDown = (event) => {
            const point = { x: event.point.x, y: event.point.y };
            let snappedPoint = snapToGrid(point, gridStepPixels);

            if (selectedTool === 'line') {
                if (!currentLineStart) {
                    setCurrentLineStart(snappedPoint);
                    setIsDrawing(true);
                } else {
                    const endPoint = snapToOrthogonal(currentLineStart, snappedPoint);
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
                const clickedElement = elements.find(el => {
                    if (el.type === 'line') {
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    if (el.type === 'arc') {
                        const dist = distance(point, el.center);
                        return Math.abs(dist - el.radius) < 10;
                    }
                    return false;
                });
                
                if (clickedElement) {
                    selectElement(clickedElement, true);
                } else {
                    selectElement(null);
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
                    return false;
                });
                
                if (clickedElement) {
                    deleteElement(clickedElement.id);
                } else if (selectedElements.length > 0) {
                    deleteSelectedElements();
                }
            } else if (selectedTool === 'arc') {
                const clickedElement = elements.find(el => {
                    if (el.type === 'line') {
                        return isPointOnLine(point, el.start, el.end, 10);
                    }
                    return false;
                });
                
                if (clickedElement) {
                    const isAlreadySelected = selectedElements.some(el => el.id === clickedElement.id);
                    
                    if (isAlreadySelected) {
                        selectElement(clickedElement, true);
                    } else if (selectedElements.length < 2) {
                        selectElement(clickedElement, true);
                    }
                } else {
                    selectElement(null);
                }
            }
        };

        tool.onMouseMove = (event) => {
            if (selectedTool === 'line' && currentLineStart) {
                setIsDrawing(true);
                // Перерисовываем canvas с временной линией
                scope.project.clear();
                
                // Отрисовываем сетку
                if (grid.visible) {
                    drawGrid(scope, gridStepPixels, grid.showMajorLines);
                }
                
                // Отрисовываем элементы
                elements.forEach((element) => {
                    const isSelected = selectedElements.some(sel => sel.id === element.id);
                    if (element.type === 'line') {
                        drawLine(scope, element, isSelected);
                    } else if (element.type === 'arc') {
                        drawArc(scope, element, isSelected);
                    }
                });
                
                // Отрисовываем временную линию
                const point = { x: event.point.x, y: event.point.y };
                const snappedPoint = snapToGrid(point, gridStepPixels);
                const endPoint = snapToOrthogonal(currentLineStart, snappedPoint);
                const finalEndPoint = snapToGrid(endPoint, gridStepPixels);
                
                const tempLine = new paper.Path.Line({
                    from: [currentLineStart.x, currentLineStart.y],
                    to: [finalEndPoint.x, finalEndPoint.y],
                    strokeColor: '#999',
                    strokeWidth: 2,
                });
                
                const length = distance(currentLineStart, finalEndPoint);
                const lengthText = formatLengthMM(length);
                const midX = (currentLineStart.x + finalEndPoint.x) / 2;
                const midY = (currentLineStart.y + finalEndPoint.y) / 2;
                
                const tempText = new paper.PointText({
                    point: [midX, midY - 15],
                    content: lengthText,
                    fillColor: '#666',
                    fontSize: 11,
                });
                
                scope.view.draw();
            }
        };

        tool.activate();

        return () => {
            tool.remove();
        };
    }, [selectedTool, currentLineStart, isDrawing, elements, selectedElements, gridStepPixels, paperProject, grid, dimensionsVisible, addElement, selectElement, deleteElement, deleteSelectedElements, setIsDrawing, setCurrentLineStart]);

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

    const drawLine = (scope, element, isSelected) => {
        const line = new paper.Path.Line({
            from: [element.start.x, element.start.y],
            to: [element.end.x, element.end.y],
            strokeColor: isSelected ? '#0073aa' : '#000',
            strokeWidth: isSelected ? 3 : 2,
        });

        line.data = { elementId: element.id, type: 'line' };

        // Отрисовка размеров (сноска)
        if (dimensionsVisible) {
            drawDimensionCallout(scope, element, isSelected);
        }
    };

    const drawArc = (scope, element, isSelected) => {
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

        path.strokeColor = isSelected ? '#0073aa' : '#000';
        path.strokeWidth = isSelected ? 3 : 2;
        path.data = { elementId: element.id, type: 'arc' };
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

        const textX = horizontalStartX + horizontalLength / 2;
        const textY = horizontalStartY - 12;

        const lengthText = formatLengthMM(element.length || distance(element.start, element.end));
        const strokeColor = isSelected ? '#0073aa' : '#666';

        // Косая линия
        const leaderLine = new paper.Path.Line({
            from: [leaderStartX, leaderStartY],
            to: [leaderEndX, leaderEndY],
            strokeColor: strokeColor,
            strokeWidth: 1,
        });

        // Горизонтальная линия
        const horizontalLine = new paper.Path.Line({
            from: [horizontalStartX, horizontalStartY],
            to: [horizontalEndX, horizontalEndY],
            strokeColor: strokeColor,
            strokeWidth: 1,
        });

        // Текст
        const text = new paper.PointText({
            point: [textX - 25, textY],
            content: lengthText,
            fillColor: strokeColor,
            fontSize: 11,
        });
    };

    // Обработка создания скругления между двумя линиями
    useEffect(() => {
        if (selectedTool === 'arc' && selectedElements.length === 2) {
            const line1 = selectedElements[0];
            const line2 = selectedElements[1];
            
            if (line1.type === 'line' && line2.type === 'line') {
                createArcAtCorner(line1, line2);
            }
        }
    }, [selectedTool, selectedElements]);

    const createArcAtCorner = (line1, line2) => {
        const connection = findConnectionPoint(line1, line2, 10);
        
        if (!connection) {
            return;
        }
        
        const arcRadius = mmToPixels(5); // 5 мм по умолчанию
        
        const line1StartPoint = connection.line1End ? line1.start : line1.end;
        const line2StartPoint = connection.line2End ? line2.start : line2.end;
        
        const dir1 = lineDirection({ start: connection, end: line1StartPoint });
        const dir2 = lineDirection({ start: connection, end: line2StartPoint });
        
        const angle1 = Math.atan2(dir1.y, dir1.x) * (180 / Math.PI);
        const angle2 = Math.atan2(dir2.y, dir2.x) * (180 / Math.PI);
        
        const arcStartPoint = {
            x: connection.x + dir1.x * arcRadius,
            y: connection.y + dir1.y * arcRadius,
        };
        const arcEndPoint = {
            x: connection.x + dir2.x * arcRadius,
            y: connection.y + dir2.y * arcRadius,
        };
        
        const bisectorAngle = (angle1 + angle2) / 2;
        const bisectorRad = (bisectorAngle * Math.PI) / 180;
        const bisectorDir = { x: Math.cos(bisectorRad), y: Math.sin(bisectorRad) };
        
        let angleDiff = Math.abs(angle2 - angle1);
        if (angleDiff > 180) {
            angleDiff = 360 - angleDiff;
        }
        const angleDiffRad = (angleDiff * Math.PI) / 180;
        
        const centerDist = arcRadius / Math.sin(angleDiffRad / 2);
        const arcCenter = {
            x: connection.x + bisectorDir.x * centerDist,
            y: connection.y + bisectorDir.y * centerDist,
        };
        
        const newLine1 = {
            type: 'line',
            start: line1StartPoint,
            end: arcStartPoint,
            length: distance(line1StartPoint, arcStartPoint),
        };
        
        const newLine2 = {
            type: 'line',
            start: arcEndPoint,
            end: line2StartPoint,
            length: distance(arcEndPoint, line2StartPoint),
        };
        
        const arcStartAngleRad = Math.atan2(arcStartPoint.y - arcCenter.y, arcStartPoint.x - arcCenter.x);
        const arcAngleRad = angleDiffRad;
        
        let arcStartAngle = arcStartAngleRad * (180 / Math.PI);
        if (arcStartAngle > 180) arcStartAngle -= 360;
        if (arcStartAngle < -180) arcStartAngle += 360;
        
        const arcAngle = arcAngleRad * (180 / Math.PI);
        
        const newArc = {
            type: 'arc',
            center: arcCenter,
            radius: arcRadius,
            startAngle: arcStartAngle,
            endAngle: arcStartAngle + arcAngle,
            angle: arcAngle,
        };
        
        deleteElement(line1.id);
        deleteElement(line2.id);
        addElement(newLine1);
        addElement(newLine2);
        addElement(newArc);
        
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

