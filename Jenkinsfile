pipeline {
    agent {
        dockerfile { filename 'Dockerfile.ci' }
    }

    stages {
        stage('Dependencies') {

            steps {
                sh 'mkdir ~/.npm-global'
                sh 'npm config set prefix "~/.npm-global"'
                sh 'npm install'
                sh 'npm install -g bower grunt-cli'
                sh '~/.npm-global/bin/bower install'
            }

        }
        stage('Tests') {

            environment {
                CODECOV_TOKEN = '71724648-0254-4cd6-84b2-a7da9b2134ef'
            }

            steps {
                sh 'npm test'
                sh 'npm run codecov'
            }
        }
    }

    post {
        always {
            junit(testResults: "junit_results/*.xml", allowEmptyResults: true)
        }
    }
}
