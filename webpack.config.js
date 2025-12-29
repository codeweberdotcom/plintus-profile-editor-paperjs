const path = require('path');

module.exports = {
  entry: './admin/js/src/index.js',
  output: {
    path: path.resolve(__dirname, 'admin/js'),
    filename: 'editor.bundle.js',
  },
  optimization: {
    minimize: false, // Отключаем минификацию для отладки
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    paper: 'paper',
  },
};






