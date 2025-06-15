#!groovy
@Library('ci-scripts') _

pipeline {
    agent {
        dockerfile { filename 'Dockerfile.ci' }
    }

    stages {
        stage('Dependencies') {

            steps {
                sh 'npm install'
                sh 'bower install'
            }

        }
        stage('Tests') {
            steps {
                sh 'npm test'
            }

            post {
                always {
                    junit(testResults: "junit_results/*.xml", allowEmptyResults: true)
                }
            }

        }
    }

    post {
        always {
            slackBuildSummary()
        }
    }
}
