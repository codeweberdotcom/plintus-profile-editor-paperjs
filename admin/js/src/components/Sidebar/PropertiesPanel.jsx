import React from 'react';
import LineProperties from './LineProperties';
import ArcProperties from './ArcProperties';
import { useEditorStore } from '../../store/useEditorStore';
import { distance, formatLengthMM } from '../../utils/geometry';
import './PropertiesPanel.css';

function PropertiesPanel({ elements }) {
    const { deleteSelectedElements } = useEditorStore();

    const handleDelete = () => {
        deleteSelectedElements();
    };

    const lineElements = elements.filter(el => el.type === 'line');
    const arcElements = elements.filter(el => el.type === 'arc');

    const getElementLength = (element) => {
        if (element.type === 'line') {
            if (element.start && element.end) {
                return distance(element.start, element.end);
            } else if (element.length) {
                return element.length;
            }
            return 0;
        }
        if (element.type === 'arc') {
            const radius = element.radius || 0;
            const angle = element.angle || 90;
            const angleRad = (angle * Math.PI) / 180;
            return radius * angleRad;
        }
        return 0;
    };

    return (
        <div className="plintus-properties-panel">
            <div className="panel-header">
                <h3>
                    {elements.length === 0 
                        ? 'Properties' 
                        : `Properties (${elements.length} selected)`}
                </h3>
                {elements.length > 0 && (
                    <button onClick={handleDelete} className="delete-button">
                        Delete
                    </button>
                )}
            </div>

            <div className="panel-content">
                {elements.length > 0 && (
                    <div className="properties-elements-list">
                        <h4>Selected Elements:</h4>
                        <ul className="properties-elements-list-items">
                            {elements.map((element, index) => {
                                const elementLength = getElementLength(element);
                                const lengthText = formatLengthMM(elementLength);
                                return (
                                    <li key={element.id} className="properties-element-item">
                                        <span className="element-type-badge">{element.type}</span>
                                        <span className="element-id">#{index + 1}</span>
                                        <span className="element-length">{lengthText}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {lineElements.length > 0 && (
                    <LineProperties elements={lineElements} />
                )}

                {arcElements.length === 1 && (
                    <ArcProperties element={arcElements[0]} />
                )}
            </div>
        </div>
    );
}

export default PropertiesPanel;

