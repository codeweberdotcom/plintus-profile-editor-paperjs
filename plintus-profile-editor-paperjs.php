<?php
/**
 * Plugin Name: Plintus Profile Editor (Paper.js)
 * Plugin URI: https://example.com/plintus-profile-editor-paperjs
 * Description: Редактор профилей плинтусов по сетке с возможностью рисования линий, скруглений и редактирования (на базе Paper.js)
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://example.com
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: plintus-profile-editor-paperjs
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly
}

// Define plugin constants
define('PLINTUS_PROFILE_EDITOR_PAPERJS_VERSION', '1.0.0');
define('PLINTUS_PROFILE_EDITOR_PAPERJS_PATH', plugin_dir_path(__FILE__));
define('PLINTUS_PROFILE_EDITOR_PAPERJS_URL', plugin_dir_url(__FILE__));
define('PLINTUS_PROFILE_EDITOR_PAPERJS_BASENAME', plugin_basename(__FILE__));

// Autoloader
spl_autoload_register(function ($class) {
    $prefix = 'PlintusProfileEditorPaperjs\\';
    $base_dir = PLINTUS_PROFILE_EDITOR_PAPERJS_PATH . 'includes/';
    
    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }
    
    $relative_class = substr($class, $len);
    $file_name = 'class-' . strtolower($relative_class) . '.php';
    $file = $base_dir . $file_name;
    
    if (file_exists($file)) {
        require $file;
    }
});

// Initialize plugin
function plintus_profile_editor_paperjs_init() {
    $plugin = new \PlintusProfileEditorPaperjs\Plugin();
    $plugin->init();
}
add_action('plugins_loaded', 'plintus_profile_editor_paperjs_init');

// Activation hook
register_activation_hook(__FILE__, function() {
    flush_rewrite_rules();
});

// Deactivation hook
register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
});






