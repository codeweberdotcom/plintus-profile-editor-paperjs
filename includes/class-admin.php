<?php
namespace PlintusProfileEditorPaperjs;

class Admin {
    public function init() {
        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_scripts']);
        add_filter('post_row_actions', [$this, 'add_row_actions'], 10, 2);
        add_action('edit_form_after_title', [$this, 'add_editor_interface']);
        add_filter('get_sample_permalink_html', [$this, 'remove_permalink_editor'], 10, 5);
    }

    public function add_menu_page() {
        // Menu уже есть через CPT
    }

    public function enqueue_scripts($hook) {
        global $post;

        // Загружаем только на странице редактирования профиля
        if ($hook !== 'post.php' && $hook !== 'post-new.php') {
            return;
        }

        if (!$post || $post->post_type !== CPT::POST_TYPE) {
            return;
        }

        // Загружаем React из CDN
        wp_enqueue_script(
            'react',
            'https://unpkg.com/react@18/umd/react.production.min.js',
            [],
            '18.2.0',
            true
        );

        wp_enqueue_script(
            'react-dom',
            'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
            ['react'],
            '18.2.0',
            true
        );

        // Загружаем Paper.js
        wp_enqueue_script(
            'paper',
            'https://unpkg.com/paper@0.12.17/dist/paper-full.min.js',
            [],
            '0.12.17',
            true
        );

        // Загружаем jsPDF для экспорта в PDF
        wp_enqueue_script(
            'jspdf',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            [],
            '2.5.1',
            true
        );

        // Загружаем svg2pdf для векторного экспорта
        wp_enqueue_script(
            'svg2pdf',
            'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.6.0/dist/svg2pdf.umd.min.js',
            ['jspdf'],
            '2.6.0',
            true
        );

        // Загружаем React редактор
        wp_enqueue_script(
            'plintus-profile-editor-paperjs',
            Plugin::get_url() . 'admin/js/editor.bundle.js',
            ['react', 'react-dom', 'paper', 'jspdf', 'svg2pdf'],
            Plugin::get_version(),
            true
        );

        wp_enqueue_style(
            'plintus-profile-editor-paperjs-admin',
            Plugin::get_url() . 'admin/css/admin.css',
            [],
            Plugin::get_version()
        );

        // Подключаем стили Unicons из темы Codeweber
        $this->enqueue_unicons_styles();

        // Передаем данные в JavaScript
        wp_localize_script('plintus-profile-editor-paperjs', 'plintusEditor', array(
            'apiUrl' => rest_url('plintus-paperjs/v1/'),
            'nonce' => wp_create_nonce('wp_rest'),
            'profileId' => $post->ID,
            'postId' => $post->ID,
            'restUrl' => rest_url(),
            'strings' => array(
                'lineTool' => __('Line Tool', 'plintus-profile-editor-paperjs'),
                'arcTool' => __('Arc Tool', 'plintus-profile-editor-paperjs'),
                'selectTool' => __('Select Tool', 'plintus-profile-editor-paperjs'),
                'deleteTool' => __('Delete', 'plintus-profile-editor-paperjs'),
            ),
        ));
    }

    public function add_row_actions($actions, $post) {
        if ($post->post_type === CPT::POST_TYPE) {
            $actions['edit_profile'] = sprintf(
                '<a href="%s">%s</a>',
                get_edit_post_link($post->ID),
                __('Edit Profile', 'plintus-profile-editor-paperjs')
            );
        }
        return $actions;
    }

    public function add_editor_interface($post) {
        if ($post->post_type !== CPT::POST_TYPE) {
            return;
        }
        ?>
        <div id="plintus-profile-editor-paperjs-root"></div>
        <?php
    }

    public function remove_permalink_editor($return, $post_id, $new_title, $new_slug, $post) {
        if ($post->post_type === CPT::POST_TYPE) {
            return '';
        }
        return $return;
    }

    /**
     * Подключить стили Unicons из темы Codeweber
     */
    private function enqueue_unicons_styles() {
        $theme_path = get_template_directory();
        $theme_uri = get_template_directory_uri();
        $icons_scss_path = $theme_path . '/src/assets/scss/theme/_icons.scss';

        if (!file_exists($icons_scss_path)) {
            return;
        }

        $icons_scss_content = file_get_contents($icons_scss_path);
        $icons_css = '';

        // Извлекаем блок @font-face для Unicons
        if (preg_match('/@font-face\s*\{[^}]*font-family:\s*[\'"]Unicons[\'"][^}]*src:[^}]*\}/s', $icons_scss_content, $font_face_match)) {
            // Заменяем относительные пути на абсолютные URL
            $font_face_css = preg_replace(
                '/url\([\'"]?\.\.\/fonts\/unicons\/([^\'"]+)[\'"]?\)/',
                "url('{$theme_uri}/dist/assets/fonts/unicons/$1')",
                $font_face_match[0]
            );
            $icons_css .= $font_face_css . "\n";
        }

        // Извлекаем все определения .uil-*:before построчно
        $lines = explode("\n", $icons_scss_content);
        $in_icon_block = false;
        $current_icon_block = '';

        foreach ($lines as $line) {
            $trimmed_line = trim($line);

            // Начало блока иконки: .uil-icon-name:before {
            if (preg_match('/^\.(uil-[a-zA-Z0-9\-]+):before\s*\{/', $trimmed_line)) {
                $in_icon_block = true;
                $current_icon_block = $trimmed_line . "\n";
                continue;
            }

            // Внутри блока иконки
            if ($in_icon_block) {
                $current_icon_block .= $trimmed_line . "\n";

                // Конец блока (закрывающая скобка)
                if (strpos($trimmed_line, '}') !== false) {
                    $icons_css .= $current_icon_block;
                    $in_icon_block = false;
                    $current_icon_block = '';
                }
            }
        }

        // Базовые стили для иконок
        $unicons_font_css = "
        @font-face {
            font-family: 'Unicons';
            src: url('{$theme_uri}/dist/assets/fonts/unicons/Unicons.woff2') format('woff2'),
                url('{$theme_uri}/dist/assets/fonts/unicons/Unicons.woff') format('woff');
            font-weight: normal;
            font-style: normal;
            font-display: block;
        }
        [class^=\"uil-\"],
        [class*=\" uil-\"] {
            speak: none;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            word-spacing: normal;
            font-family: \"Unicons\" !important;
        }
        [class^=\"uil-\"]:before,
        [class*=\" uil-\"]:before {
            display: inline-block;
            font-family: \"Unicons\" !important;
            font-style: normal;
            font-weight: normal;
            font-variant: normal;
            text-transform: none;
            line-height: 1;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        " . $icons_css;

        wp_add_inline_style('plintus-profile-editor-paperjs-admin', $unicons_font_css);
    }
}






