import React from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { distance, formatLengthMM } from '../../utils/geometry';

function LineProperties({ elements }) {
    // Вычисляем общую длину всех выбранных линий
    const totalLength = elements.reduce((sum, element) => {
        if (element.start && element.end) {
            return sum + distance(element.start, element.end);
        } else if (element.length) {
            return sum + element.length;
        }
        return sum;
    }, 0);

    const totalLengthText = formatLengthMM(totalLength);

    return (
        <div className="line-properties">
            <h4>Свойства линии</h4>
            {elements.length > 1 && (
                <p className="line-count">Линий: {elements.length}</p>
            )}
            <div className="property-item">
                <label>Длина:</label>
                <span className="property-value">{totalLengthText}</span>
            </div>
        </div>
    );
}

export default LineProperties;






