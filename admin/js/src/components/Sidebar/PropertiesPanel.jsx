import React from 'react';
import LineProperties from './LineProperties';
import ArcProperties from './ArcProperties';
import FilletProperties from './FilletProperties';
import { useEditorStore } from '../../store/useEditorStore';
import { distance, formatLengthMM } from '../../utils/geometry';
import './PropertiesPanel.css';

function PropertiesPanel({ elements }) {
    const { deleteSelectedElements, debugNumbersVisible, toggleDebugNumbersVisible } = useEditorStore();
    const allElements = useEditorStore((state) => state.elements);

    const handleDelete = () => {
        deleteSelectedElements();
    };

    // Функция для перевода типа элемента на русский
    const getElementTypeLabel = (type) => {
        const typeLabels = {
            'line': 'Линия',
            'arc': 'Дуга',
            'fillet': 'Скругление'
        };
        return typeLabels[type] || type;
    };

    const lineElements = elements.filter(el => el.type === 'line');
    const arcElements = elements.filter(el => el.type === 'arc');
    const filletElements = elements.filter(el => el.type === 'fillet');

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
        if (element.type === 'fillet') {
            // Для fillet используем данные из element.arc
            const radius = (element.arc && element.arc.radius) || element.radius || 0;
            const angle = (element.arc && element.arc.angle) || 0;
            const angleRad = (angle * Math.PI) / 180;
            return radius * angleRad;
        }
        return 0;
    };

    // Вычисляем сводную информацию по всем элементам
    const allLines = allElements.filter(el => el.type === 'line');
    const allFillets = allElements.filter(el => el.type === 'fillet');
    
    const totalLinesLength = allLines.reduce((sum, line) => {
        return sum + getElementLength(line);
    }, 0);
    
    const totalLinesLengthText = formatLengthMM(totalLinesLength);
    const filletsCount = allFillets.length;

    return (
        <div className="plintus-properties-panel">
            <div className="panel-header">
                {elements.length > 0 && (
                    <button onClick={handleDelete} className="delete-button">
                        Удалить
                    </button>
                )}
            </div>

            <div className="panel-content">
                {/* Блок со сводной информацией */}
                <div className="properties-summary">
                    <h4>Сводка</h4>
                    <div className="summary-item">
                        <span className="summary-label">Общая длина линий:</span>
                        <span className="summary-value">{totalLinesLengthText}</span>
                    </div>
                    <div className="summary-item">
                        <span className="summary-label">Количество скруглений:</span>
                        <span className="summary-value">{filletsCount}</span>
                    </div>
                </div>

                <div className="properties-section">
                    <h3 className="properties-section-title">
                        {elements.length === 0 
                            ? 'Свойства' 
                            : `Свойства (${elements.length} выбрано)`}
                    </h3>
                </div>

                <div className="properties-elements-list">
                    <h4>Выбранные элементы:</h4>
                        {elements.length > 0 ? (
                            <ul className="properties-elements-list-items">
                                {elements.map((element, index) => {
                                    const elementLength = getElementLength(element);
                                    const lengthText = formatLengthMM(elementLength);
                                    return (
                                        <li key={element.id} className="properties-element-item">
                                            <span className="element-type-badge">{getElementTypeLabel(element.type)}</span>
                                            <span className="element-id">#{index + 1}</span>
                                            <span className="element-length">{lengthText}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="properties-empty-state">Элементы не выбраны</p>
                        )}
                    </div>

                {lineElements.length > 0 && (
                    <LineProperties elements={lineElements} />
                )}

                {arcElements.length === 1 && (
                    <ArcProperties element={arcElements[0]} />
                )}

                {filletElements.length === 1 && (
                    <FilletProperties element={filletElements[0]} />
                )}

                {/* Кнопка включения/выключения отладочных номеров */}
                <div className="debug-controls" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #ddd' }}>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleDebugNumbersVisible();
                        }}
                        className={debugNumbersVisible ? 'active' : ''}
                        style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: debugNumbersVisible ? '#0073aa' : '#f0f0f0',
                            color: debugNumbersVisible ? '#fff' : '#333',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                        title="Показать/скрыть номера точек для отладки"
                    >
                        {debugNumbersVisible ? '✓ ' : ''}Отладочные номера
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PropertiesPanel;




