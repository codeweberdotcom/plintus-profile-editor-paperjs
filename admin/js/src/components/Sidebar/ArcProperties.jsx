import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { formatLengthMM, pixelsToMM, mmToPixels } from '../../utils/geometry';

function ArcProperties({ element }) {
    const { updateElement } = useEditorStore();
    const [radiusMM, setRadiusMM] = useState(
        element.radius ? Math.round(pixelsToMM(element.radius)) : 5
    );
    const [angle, setAngle] = useState(
        element.angle ? Math.round(element.angle) : 90
    );

    // Синхронизируем значения с элементом при его изменении
    useEffect(() => {
        if (element.radius) {
            const newRadiusMM = Math.round(pixelsToMM(element.radius));
            setRadiusMM(newRadiusMM);
        }
        if (element.angle !== undefined) {
            setAngle(Math.round(element.angle));
        }
    }, [element.radius, element.angle]);

    const handleRadiusChange = (e) => {
        const newValue = parseFloat(e.target.value);
        if (!isNaN(newValue) && newValue > 0) {
            setRadiusMM(newValue);
            updateElement(element.id, {
                radius: mmToPixels(newValue),
            });
        }
    };

    const handleAngleChange = (e) => {
        const newValue = parseFloat(e.target.value);
        if (!isNaN(newValue) && newValue >= 0 && newValue <= 360) {
            setAngle(newValue);
            updateElement(element.id, {
                angle: newValue,
            });
        }
    };

    // Вычисляем длину дуги
    const radius = element.radius || 0;
    const angleRad = (angle * Math.PI) / 180;
    const arcLength = radius * angleRad;
    const arcLengthText = formatLengthMM(arcLength);

    return (
        <div className="arc-properties">
            <h4>Свойства дуги</h4>
            <div className="property-item">
                <label htmlFor="arc-radius">Радиус (мм):</label>
                <input
                    id="arc-radius"
                    type="number"
                    min="1"
                    step="1"
                    value={radiusMM}
                    onChange={handleRadiusChange}
                    className="property-input"
                />
            </div>
            <div className="property-item">
                <label htmlFor="arc-angle">Угол (°):</label>
                <input
                    id="arc-angle"
                    type="number"
                    min="0"
                    max="360"
                    step="1"
                    value={angle}
                    onChange={handleAngleChange}
                    className="property-input"
                />
            </div>
            <div className="property-item">
                <label>Длина:</label>
                <span className="property-value">{arcLengthText}</span>
            </div>
        </div>
    );
}

export default ArcProperties;




