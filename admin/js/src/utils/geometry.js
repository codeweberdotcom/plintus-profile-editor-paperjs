/**
 * Вычисление расстояния между двумя точками
 */
export function distance(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Конвертация миллиметров в пиксели (1 мм = 3.779527559 пикселей при 96 DPI)
 */
export function mmToPixels(mm) {
    return mm * 3.779527559;
}

/**
 * Конвертация пикселей в миллиметры
 */
export function pixelsToMM(pixels) {
    return pixels / 3.779527559;
}

/**
 * Форматирование длины в миллиметрах
 */
export function formatLengthMM(lengthPixels) {
    const mm = pixelsToMM(lengthPixels);
    return `${Math.round(mm * 10) / 10} мм`;
}

/**
 * Округление до ближайшего кратного значения
 */
export function roundToMultiple(value, multiple) {
    return Math.round(value / multiple) * multiple;
}

/**
 * Привязка точки к сетке
 */
export function snapToGrid(point, stepPixels) {
    return {
        x: roundToMultiple(point.x, stepPixels),
        y: roundToMultiple(point.y, stepPixels),
    };
}

/**
 * Проверка, является ли линия горизонтальной или вертикальной
 */
export function isOrthogonal(point1, point2, tolerance = 5) {
    const dx = Math.abs(point2.x - point1.x);
    const dy = Math.abs(point2.y - point1.y);
    return dx < tolerance || dy < tolerance;
}

/**
 * Приведение точки к ближайшей ортогональной (90 градусов)
 */
export function snapToOrthogonal(start, end) {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    
    if (dx > dy) {
        // Горизонтальная линия
        return { x: end.x, y: start.y };
    } else {
        // Вертикальная линия
        return { x: start.x, y: end.y };
    }
}

/**
 * Проверка, находится ли точка на линии
 */
export function isPointOnLine(point, lineStart, lineEnd, tolerance = 10) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return false;
    
    const t = Math.max(0, Math.min(1,
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (length * length)
    ));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    
    const dist = Math.sqrt(
        Math.pow(point.x - projX, 2) + Math.pow(point.y - projY, 2)
    );
    
    return dist < tolerance;
}

/**
 * Вычисление угла между двумя точками (в градусах)
 */
export function angle(point1, point2) {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Получение точки на указанном расстоянии от начальной точки под углом
 */
export function pointAtDistance(start, angleDeg, distance) {
    const radians = (angleDeg * Math.PI) / 180;
    return {
        x: start.x + distance * Math.cos(radians),
        y: start.y + distance * Math.sin(radians),
    };
}

/**
 * Направление линии (нормализованный вектор)
 */
export function lineDirection(line) {
    const dx = line.end.x - line.start.x;
    const dy = line.end.y - line.start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) {
        return { x: 0, y: 0 };
    }
    
    return { x: dx / length, y: dy / length };
}

/**
 * Пересечение двух линий
 */
export function lineIntersection(line1, line2) {
    const x1 = line1.start.x;
    const y1 = line1.start.y;
    const x2 = line1.end.x;
    const y2 = line1.end.y;
    const x3 = line2.start.x;
    const y3 = line2.start.y;
    const x4 = line2.end.x;
    const y4 = line2.end.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    
    if (Math.abs(denom) < 0.0001) {
        return null; // Линии параллельны
    }
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1),
        };
    }
    
    return null;
}

/**
 * Поиск точки соединения двух линий
 */
export function findConnectionPoint(line1, line2, tolerance = 10) {
    const p1 = line1.start;
    const p2 = line1.end;
    const p3 = line2.start;
    const p4 = line2.end;
    
    // Проверяем все возможные комбинации точек
    const points = [
        { point: p1, line1End: true, line2End: false },
        { point: p2, line1End: true, line2End: false },
        { point: p3, line1End: false, line2End: true },
        { point: p4, line1End: false, line2End: true },
    ];
    
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const dist = distance(points[i].point, points[j].point);
            if (dist < tolerance) {
                return {
                    ...points[i].point,
                    line1End: points[i].line1End || points[j].line1End,
                    line2End: points[i].line2End || points[j].line2End,
                };
            }
        }
    }
    
    return null;
}

/**
 * Вычисление длины дуги
 */
export function getArcLength(arc) {
    const radius = arc.radius;
    const angleRad = (arc.angle * Math.PI) / 180;
    return radius * angleRad;
}




