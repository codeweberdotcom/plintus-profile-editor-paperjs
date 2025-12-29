import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { pixelsToMM } from '../../utils/geometry';

function ChamferProperties({ element }) {
    const { updateChamferDepth } = useEditorStore();
    const [depthMM, setDepthMM] = useState(
        element.depth ? Math.round(pixelsToMM(element.depth)) : 2
    );

    // Синхронизируем значение с элементом при его изменении
    useEffect(() => {
        if (element.depth) {
            const newDepthMM = Math.round(pixelsToMM(element.depth));
            setDepthMM(newDepthMM);
        }
    }, [element.depth]);

    const handleDepthChange = (e) => {
        const newValue = parseFloat(e.target.value);
        if (!isNaN(newValue) && newValue > 0) {
            setDepthMM(newValue);
            updateChamferDepth(element.id, newValue);
        }
    };

    return (
        <div className="chamfer-properties">
            <h4>Свойства фаски</h4>
            <div className="property-item">
                <label htmlFor="chamfer-depth">Глубина (мм):</label>
                <input
                    id="chamfer-depth"
                    type="number"
                    min="1"
                    step="1"
                    value={depthMM}
                    onChange={handleDepthChange}
                    className="property-input"
                />
            </div>
        </div>
    );
}

export default ChamferProperties;

