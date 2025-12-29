import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { pixelsToMM } from '../../utils/geometry';

function FilletProperties({ element }) {
    const { updateFilletRadius } = useEditorStore();
    const [radiusMM, setRadiusMM] = useState(
        element.radius ? Math.round(pixelsToMM(element.radius)) : 3
    );

    // Синхронизируем значение с элементом при его изменении
    useEffect(() => {
        if (element.radius) {
            const newRadiusMM = Math.round(pixelsToMM(element.radius));
            setRadiusMM(newRadiusMM);
        }
    }, [element.radius]);

    const handleRadiusChange = (e) => {
        const newValue = parseFloat(e.target.value);
        if (!isNaN(newValue) && newValue > 0) {
            setRadiusMM(newValue);
            updateFilletRadius(element.id, newValue);
        }
    };

    return (
        <div className="fillet-properties">
d            <h4>Свойства скругления</h4>
            <div className="property-item">
                <label htmlFor="fillet-radius">Скругление (мм):</label>
                <input
                    id="fillet-radius"
                    type="number"
                    min="1"
                    step="1"
                    value={radiusMM}
                    onChange={handleRadiusChange}
                    className="property-input"
                />
            </div>
        </div>
    );
}

export default FilletProperties;

